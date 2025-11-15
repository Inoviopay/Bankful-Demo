# Bankful - Inovio Payment Integration Demo

**An interactive demonstration tool for Ann's team to understand and test the three payment flows required for Bankful's Shopify subscription integration with Inovio.**

## What Is This?

This is a **ready-to-run demo application** that shows exactly how to integrate Bankful's Shopify subscriptions with the Inovio payment gateway. It demonstrates:

1. **One-Time Transactions** - Standard payments (no recurring)
2. **Subscription Payments** - Initial payment that returns a Network Transaction ID, plus renewals using that ID
3. **Zero-Dollar Card Updates** - Validate new cards without charging

**Key Feature:** The demo shows you the exact API requests and responses, highlighting the critical **Network Transaction ID** that Shopify needs for subscription management.

## Quick Start (3 Steps)

### Prerequisites

- Docker and Docker Compose installed

### 1. Start the Demo

```bash
docker-compose up --build
```

### 2. Open Your Browser

Navigate to: **http://localhost:3000**

### 3. Enter Your Inovio Credentials

At the top of the page, enter:
- Your Inovio API Username
- Your Inovio API Password
- Your Site ID
- Your Product ID
- Check the **"Disable Fraud Scrub Rules"** box (for testing)
- Leave **Merchant Account ID blank** (optional - Inovio will use your default)

**That's it!** Card details and billing address are pre-filled with test data. Just click the buttons to test each flow.

### Stop the Demo

```bash
docker-compose down
```

## Pre-Filled Test Data

The demo loads with these **default values** (you can change them if needed):

**Card Details:**
- Card Number: `4111111111111111` (Visa test card)
- Expiry Date: `122030` (December 2030)
- CVV: `123`

**Customer Information:**
- Name: `Test User`
- Email: `test@example.com`

**Billing Address:**
- `123 Main Street, Los Angeles, CA 90001, US`

**Transaction Amounts:**
- One-Time: `$19.95`
- Subscriptions: `$29.95`

## How to Test Each Flow

### Flow 1: One-Time Transaction

**Purpose:** Simple payment with no recurring charges.

1. Click the **"One-Time Transaction"** tab
2. The form shows only the **Amount** field (pre-filled with `19.95`)
3. Click **"Process One-Time Payment"**
4. **View the Results:**
   - See the exact JSON request sent to Inovio
   - See the full JSON response from Inovio
   - Transaction status: APPROVED or DECLINED
   - Notice: **No Network Transaction ID** (not needed for one-time payments)

**For Shopify:** Just notify Shopify if payment succeeded or failed. Nothing else needed.

### Flow 2: Subscription Payment (Two Steps)

**Purpose:** Set up a recurring subscription and demonstrate renewal without CVV.

#### Step 1: Initial Subscription Payment

1. Click the **"Subscription Flow"** tab
2. In **Step 1**, the form shows only the **Amount** field (pre-filled with `29.95`)
3. Click **"Process Initial Subscription"**
4. **Watch What Happens:**
   - The **Network Transaction ID** appears in a **large green box** with a copy button
   - The message says: **"This value has been automatically filled into Step 2 below"**
   - The page **scrolls down** to Step 2
   - Step 2 shows a **green success message**: "Step 2 is ready!"
   - The Network Transaction ID field in Step 2 **pulses green** (auto-filled)

**For Shopify:** Return this Network Transaction ID to Shopify. They store it and associate it with the customer's subscription.

#### Step 2: Subscription Renewal

1. **Notice:** The Network Transaction ID and Amount are **already filled in** from Step 1
2. **Important:** There's **NO CVV field** - renewals don't require CVV!
3. Click **"Process Renewal Payment"**
4. **View the Results:**
   - The request includes the PAN + Network Transaction ID
   - The request does NOT include CVV
   - Payment processes successfully using the stored Network Transaction ID

**For Shopify:** When a subscription renews, Shopify sends you the PAN + Network Transaction ID (no CVV). You use these to charge the customer.

### Flow 3: Zero-Dollar Authorization (Card Update)

**Purpose:** Update a customer's card on file without charging them.

1. Click the **"Zero-Dollar Card Update"** tab
2. **Notice:** There are **NO form fields** - it uses the card details from the top
3. Click **"Process Zero-Dollar Authorization"**
4. **View the Results:**
   - A `$0.00` authorization is processed
   - The **Network Transaction ID** appears in a green box
   - The card is validated without any charge

**For Shopify:** When a customer wants to update their payment method for a subscription, use this flow. Return the Network Transaction ID to Shopify so they can update their records.

## Understanding the Network Transaction ID

The **Network Transaction ID** is critical for Shopify subscription management:

- **Field Names in Inovio Response:**
  - `CARD_BRAND_TRANSID` (primary)
  - `PROC_REFERENCE_NUM` (fallback)
  - `PROC_RETRIEVAL_NUM` (fallback)

- **When It's Required:**
  - Initial subscription payment (to vault the card)
  - Zero-dollar authorization (to update card on file)

- **When It's NOT Required:**
  - One-time transactions
  - Subscription renewals (used as input, not output)

## Architecture

### Backend (Node.js/Express)

- `src/server.js` - Express server with 4 API endpoints
- `src/inovioClient.js` - Inovio API client wrapper

**API Endpoints:**
- `POST /api/one-time` - One-time payment
- `POST /api/subscription-initial` - Initial subscription
- `POST /api/subscription-renewal` - Renewal payment
- `POST /api/card-update` - Zero-dollar auth

### Frontend (HTML/CSS/JavaScript)

- `public/index.html` - Tabbed interface with shared credentials
- `public/styles.css` - Responsive styling
- `public/app.js` - Form handling and API communication

### Docker Configuration

- `Dockerfile` - Node.js 18 Alpine image
- `docker-compose.yml` - Single-container deployment (no volumes)
- All source files copied into container

## Key Features

### 1. Pre-Filled Test Data
All card and billing information is pre-filled with valid test data. You only need to:
- Enter your Inovio API credentials once at the top
- Check "Disable Fraud Scrub Rules" for testing
- Click buttons to test each flow

### 2. Auto-Population of Network Transaction ID
After Step 1 of the Subscription Flow completes:
- The Network Transaction ID is **automatically filled** into Step 2
- The page **scrolls** to show Step 2
- The field **pulses green** to show it was auto-filled
- A **success message** confirms Step 2 is ready

### 3. Visual Feedback
- See exact JSON requests sent to Inovio
- See complete JSON responses from Inovio
- Network Transaction IDs highlighted in **large green boxes**
- **Copy to clipboard** buttons for easy copying
- Color-coded success/error messages

### 4. Simplified Forms
- **One-Time:** Just enter amount
- **Subscription Initial:** Just enter amount
- **Subscription Renewal:** Network Transaction ID + amount (auto-filled from Step 1)
- **Card Update:** Just click the button (no fields)

## Integration with Inovio

### Request Format

All requests are sent to:
```
https://api.inoviopay.com/payment/pmt_service.cfm
```

**Required Parameters:**
- `req_username` - Your Inovio API username
- `req_password` - Your Inovio API password
- `request_action` - Action type (CCAUTHCAP for sales, CCAUTHORIZE for $0 auth)
- `site_id` - Your site ID
- `request_response_format` - JSON
- `request_api_version` - 4.12
- Payment and customer data fields

**Optional Parameters:**
- `merch_acct_id` - Your merchant account ID (leave blank to use default)
- `REQUEST_SCRUB_FLAG` - Set to `0` to disable fraud screening for testing

### Response Format

Inovio returns JSON with fields including:
- `TRANS_STATUS_NAME` - Transaction status
- `TRANS_ID` - Transaction ID
- `CARD_BRAND_TRANSID` - Network Transaction ID (for subscriptions)
- `PROC_AUTH_RESPONSE` - Processor authorization code
- Plus many other fields (see API.md for complete documentation)

## Customization

### Using Your Own Credentials

Instead of test credentials, you can enter your production Inovio credentials in the global credentials section at the top of the page.

### Modifying for Production

1. **Security:** Add authentication/authorization to protect API endpoints
2. **Logging:** Implement comprehensive logging for debugging
3. **Error Handling:** Add retry logic and better error messages
4. **Validation:** Add server-side validation for all inputs
5. **PCI Compliance:** Ensure your deployment meets PCI-DSS requirements

## Troubleshooting

### Container Issues

**Problem:** Container won't start
```bash
# Check logs
docker-compose logs

# Rebuild container
docker-compose down
docker-compose up --build
```

### API Connection Issues

**Problem:** "No response from Inovio API"
- Check your internet connection
- Verify credentials are correct
- Ensure Inovio API is accessible from your network

### Transaction Declined

**Problem:** Transactions getting "Scrub Decline" (error 700) or "Invalid CPF" (error 707)

**Solution:** Check the **"Disable Fraud Scrub Rules"** checkbox at the top of the page. This sets `REQUEST_SCRUB_FLAG=0` which bypasses fraud screening for testing.

**Problem:** Other transaction declines
- Verify your Inovio credentials are correct
- The pre-filled card number is: 4111111111111111
- Expiry date is: 122030 (December 2030)
- CVV is: 123
- Leave Merchant Account ID **blank** (optional field)

### Network Transaction ID Missing

**Problem:** Network Transaction ID not returned
- Verify the response includes CARD_BRAND_TRANSID field
- Check processor configuration supports tokenization
- Review Inovio API response for error messages

## For Ann's Team - Quick Reference

### What You Need to Implement

**1. One-Time Payments:**
- Accept payment info from Shopify
- Send to Inovio with `request_action=CCAUTHCAP`
- Return success/failure to Shopify
- Done!

**2. Initial Subscription Payments:**
- Accept payment info from Shopify
- Send to Inovio with `request_action=CCAUTHCAP` and `request_rebill=1`
- Extract `CARD_BRAND_TRANSID` from Inovio response
- **Return this Network Transaction ID to Shopify** (critical!)
- Shopify stores this ID for future renewals

**3. Subscription Renewal Payments:**
- Shopify sends: PAN + Network Transaction ID (**no CVV**)
- Send to Inovio with `request_action=CCAUTHCAP`, `request_rebill=2`, and `orig_card_brand_transid=<the Network Transaction ID>`
- Return success/failure to Shopify

**4. Card Updates:**
- Accept new card info from Shopify
- Send to Inovio with `request_action=CCAUTHORIZE` and `li_value_1=0.00`
- Extract `CARD_BRAND_TRANSID` from response
- **Return this Network Transaction ID to Shopify**
- Shopify updates their records with the new card's ID

### Critical Points

✓ **Always return the Network Transaction ID to Shopify** for initial subscriptions and card updates
✓ **Renewals don't require CVV** - just PAN + Network Transaction ID
✓ **Use the same Network Transaction ID** throughout the subscription lifetime
✓ **Zero-dollar auths validate cards without charging**

### Testing with This Demo

1. Enter your real Inovio credentials at the top
2. Check "Disable Fraud Scrub Rules"
3. Test all three flows to see the exact requests/responses
4. Copy the code patterns for your implementation

## References

- Full Inovio API documentation: See `API.md` in this repository
- Shopify requirements: See `plan.txt` in this repository
- Inovio API Version: 4.12
- API Endpoint: https://api.inoviopay.com/payment/pmt_service.cfm

## Support

For questions about:
- **This demo:** Contact Frank Gibbs
- **Inovio API:** Contact Inovio Client Services
- **Shopify integration:** Contact Shopify Developer Support

## License

MIT License - Free to use and modify for your integration needs.
