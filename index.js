import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
dotenv.config()

import session from 'express-session'

import jwtDecode from 'jwt-decode'
import { XeroClient } from 'xero-node'

const port = 3000

const client_id = process.env.CLIENT_ID
const client_secret = process.env.CLIENT_SECRET
const redirectUrl = process.env.REDIRECT_URI
// const scopes = 'openid profile email accounting.settings accounting.reports.read accounting.journals.read accounting.contacts accounting.attachments accounting.transactions offline_access'
const scopes = 'offline_access openid profile email accounting.transactions accounting.budgets.read accounting.reports.read accounting.journals.read accounting.settings accounting.settings.read accounting.contacts accounting.contacts.read accounting.attachments accounting.attachments.read files files.read assets assets.read projects projects.read payroll.employees payroll.payruns payroll.payslip payroll.timesheets payroll.settings'

const xero = new XeroClient({
  clientId: client_id,
  clientSecret: client_secret,
  redirectUris: [redirectUrl],
  scopes: scopes.split(' '),
})

if (!client_id || !client_secret || !redirectUrl) {
  throw Error('Environment Variables not all set - please check your .env file in the project root or create one!')
}

const app = express()
app.use(express.static("public"))
app.use(express.json())
app.use(cors())

app.use(session({
  secret: 'something crazy',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false },
}))

app.get('/', (req, res) => {
  res.send(`
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
      <h1 style="font-size: 2rem; font-weight: bold; margin-bottom: 2rem;">
        Hello World!
      </h1>
      <a href='/connect'>Connect to Xero</a>
    </div>
  `)
})

app.get('/connect', async (req, res) => {
  try {
    const consentUrl = await xero.buildConsentUrl()
    // console.log('consentUrl: >>>>>>>>>', consentUrl)
    res.redirect(consentUrl)
  } catch (err) {
    res.send('Sorry, something went wrong')
  }
})

app.get('/callback', async (req, res) => {
  // console.log('req.url: >>>>>>>>>', req.url)

  try {
    const tokenSet = await xero.apiCallback(req.url)
    await xero.updateTenants()

    const decodedIdToken = jwtDecode(tokenSet.id_token)
    const decodedAccessToken = jwtDecode(tokenSet.access_token)

    req.session.decodedIdToken = decodedIdToken
    req.session.decodedAccessToken = decodedAccessToken
    req.session.tokenSet = tokenSet
    req.session.allTenants = xero.tenants
    req.session.activeTenant = xero.tenants[0]

    // console.log('req.session: >>>>>>>>>', req.session)

    res.redirect('/accounts')
  } catch (err) {
    res.send('Sorry, something went wrong')
  }
})

app.get('/accounts', async (req, res) => {
  try {
    const accountsResponse = await xero.accountingApi.getAccounts(req.session.activeTenant?.tenantId || '')
    const accounts = accountsResponse.body.accounts // Access the accounts from the response

    // Build the HTML table
    let tableHTML = '<table border="1">';
    if (accounts.length > 0) {
      tableHTML += '<thead><tr>';
      Object.keys(accounts[0]).forEach((key) => {
        tableHTML += `<th>${key}</th>`;
      });
      tableHTML += '</tr></thead>';
    }

    tableHTML += '<tbody>';
    accounts.forEach((account) => {
      tableHTML += '<tr>';
      Object.values(account).forEach((value) => {
        tableHTML += `<td>${value}</td>`;
      });
      tableHTML += '</tr>';
    });
    tableHTML += '</tbody></table>';

    res.send(tableHTML);

    // res.json(accounts)
  } catch (err) {
    if (err) {
      res.redirect('/connect')
      // console.log('Connection Error: >>>>>>>>>', err)
    }
  }
})

app.get('/organisation', async (req, res) => {
  try {
    const tokenSet = await xero.readTokenSet()
    console.log(tokenSet.expired() ? 'token expired' : 'token valid')
    const response = await xero.accountingApi.getOrganisations(req.session.activeTenant?.tenantId || '')
    // res.json({ message: `Hello, ${response.body.organisations[0].name}` })
    res.send(`
      <h1 style="margin-bottom: 1rem;">
        Hello, ${response.body.organisations[0].name}
      </h1>
      <a href='/accounts'>View Accounts Info</a>
    `)
  } catch (err) {
    // res.send('Sorry, something went wrong')
    res.redirect('/connect')
  }
})

app.listen(port, () => {
  console.log('Server is running on port', port)
})
