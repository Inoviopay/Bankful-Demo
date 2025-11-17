/**
 * ============================================================================
 * BANKFUL - INOVIO PAYMENT GATEWAY INTEGRATION SERVER
 * ============================================================================
 *
 * This Express server demonstrates the three payment flows required for
 * integrating Bankful's Shopify subscription service with the Inovio payment
 * gateway.
 *
 * IMPORTANT FOR ANN'S TEAM:
 * This code shows exactly how to structure requests for each payment scenario.
 * The critical concept is the "Network Transaction ID" - this is what Shopify
 * uses to vault cards and process subscription renewals without requiring CVV.
 *
 * FLOWS IMPLEMENTED:
 * 1. One-Time Transaction    - Simple payment with no recurring charges
 * 2. Subscription Initial     - First payment that returns Network Transaction ID
 * 3. Subscription Renewal     - Recurring payment using Network Transaction ID (no CVV)
 * 4. Zero-Dollar Card Update  - Validate new card without charging
 *
 * API ENDPOINT: https://api.inoviopay.com/payment/pmt_service.cfm
 * API VERSION: 4.12
 *
 * ============================================================================
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const inovioClient = require('./inovioClient');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// MIDDLEWARE CONFIGURATION
// ============================================================================

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from public directory (demo UI)
app.use(express.static(path.join(__dirname, '../public')));

// ============================================================================
// HEALTH CHECK ENDPOINT
// ============================================================================

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Bankful - Inovio Demo Server Running' });
});

// ============================================================================
// FLOW 1: ONE-TIME TRANSACTION
// ============================================================================
/**
 * One-Time Transaction Endpoint
 *
 * PURPOSE:
 * Process a simple payment with no recurring charges. This is used when a
 * customer makes a one-time purchase (not a subscription).
 *
 * SHOPIFY INTEGRATION:
 * - When Shopify sends payment info for a one-time purchase, use this flow
 * - Send the transaction to Inovio with request_action=CCAUTHCAP
 * - Return success/failure to Shopify
 * - No Network Transaction ID is needed or returned
 *
 * KEY PARAMETERS:
 * - request_action: CCAUTHCAP (authorize and capture in one step)
 * - pmt_numb: Card number (PAN)
 * - pmt_expiry: Expiry date (MMYYYY format)
 * - pmt_key: CVV code
 * - li_value_1: Transaction amount in dollars (e.g., "19.95")
 *
 * OPTIONAL PARAMETERS:
 * - merch_acct_id: Merchant account ID (if blank, Inovio uses default for site_id)
 * - REQUEST_SCRUB_FLAG: Set to "0" to bypass fraud screening (for testing only)
 */
app.post('/api/one-time', async (req, res) => {
  try {
    const { credentials, payment } = req.body;

    // Build the Inovio API request
    const requestData = {
      // ----------------------------------------------------------------
      // AUTHENTICATION - Required for all requests
      // ----------------------------------------------------------------
      req_username: credentials.username,     // Your Inovio API username
      req_password: credentials.password,     // Your Inovio API password

      // ----------------------------------------------------------------
      // TRANSACTION TYPE - CCAUTHCAP = Authorize and Capture
      // ----------------------------------------------------------------
      request_action: 'CCAUTHCAP',           // Auth + Capture in one step

      // ----------------------------------------------------------------
      // API CONFIGURATION
      // ----------------------------------------------------------------
      site_id: credentials.siteId,            // Your Inovio site ID
      request_response_format: 'JSON',        // Get JSON response
      request_api_version: '4.12',            // API version

      // ----------------------------------------------------------------
      // PAYMENT DATA - Card information
      // ----------------------------------------------------------------
      pmt_numb: payment.cardNumber,           // Card number (PAN)
      pmt_expiry: payment.expiryDate,         // Expiry (MMYYYY format)
      pmt_key: payment.cvv,                   // CVV code

      // ----------------------------------------------------------------
      // CUSTOMER DATA - Cardholder information
      // ----------------------------------------------------------------
      cust_fname: payment.firstName,          // First name
      cust_lname: payment.lastName,           // Last name
      cust_email: payment.email,              // Email address

      // ----------------------------------------------------------------
      // BILLING DATA - Billing address
      // ----------------------------------------------------------------
      bill_addr: payment.billingAddress,      // Street address
      bill_addr_city: payment.billingCity,    // City
      bill_addr_state: payment.billingState,  // State/Province
      bill_addr_zip: payment.billingZip,      // ZIP/Postal code
      bill_addr_country: payment.billingCountry, // Country code (e.g., "US")

      // ----------------------------------------------------------------
      // LINE ITEM DATA - Transaction amount and product
      // ----------------------------------------------------------------
      li_prod_id_1: credentials.productId,    // Product ID
      li_value_1: payment.amount,             // Amount in dollars (e.g., "19.95")
      li_count_1: 1                           // Quantity
    };

    // ----------------------------------------------------------------
    // OPTIONAL PARAMETERS - Add only if provided
    // ----------------------------------------------------------------

    // Merchant Account ID (optional - Inovio uses default if not provided)
    if (credentials.merchantAccountId) {
      requestData.merch_acct_id = credentials.merchantAccountId;
    }

    // Fraud screening bypass (for testing only - DO NOT use in production)
    if (credentials.disableScrub) {
      requestData.REQUEST_SCRUB_FLAG = '0';
    }

    // Send request to Inovio
    const response = await inovioClient.processPayment(requestData);

    // ----------------------------------------------------------------
    // SHOPIFY INTEGRATION POINT
    // ----------------------------------------------------------------
    // For one-time transactions, you only need to check if the payment
    // succeeded. The response.TRANS_STATUS_NAME field will be "APPROVED"
    // for successful transactions.
    //
    // Return success/failure to Shopify:
    // - If APPROVED: Mark the order as paid
    // - If DECLINED: Show error to customer
    // ----------------------------------------------------------------

    res.json({
      success: true,
      request: requestData,
      response: response
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

// ============================================================================
// FLOW 2: SUBSCRIPTION INITIAL PAYMENT
// ============================================================================
/**
 * Subscription Initial Payment Endpoint
 *
 * PURPOSE:
 * Process the first payment for a subscription and get the CUST_ID
 * that Shopify will use to vault the card for future renewals.
 *
 * SHOPIFY INTEGRATION:
 * - When Shopify initiates a new subscription, use this flow
 * - Send the transaction to Inovio with REQUEST_ACTION=CCAUTHCAP and REQUEST_REBILL=1
 * - Extract CUST_ID from the response
 * - **CRITICAL**: Return CUST_ID to Shopify as the "Network Transaction ID"
 * - Shopify stores this ID and sends it back for all future renewals
 *
 * KEY PARAMETERS:
 * - REQUEST_ACTION: CCAUTHCAP (authorize and capture)
 * - All standard card, customer, and billing fields
 *
 * CUST_ID (Network Transaction ID for Shopify):
 * This is the most important field in the response. Inovio returns CUST_ID which
 * you return to Shopify as the "Network Transaction ID". This approach is backwards
 * compatible with processors that don't support NETWORK TRANSACTION IDs yet.
 *
 * This CUST_ID is unique to the customer. Shopify uses it to charge the same card
 * for renewals without requiring the CVV again.
 */
app.post('/api/subscription-initial', async (req, res) => {
  try {
    const { credentials, payment } = req.body;

    // Build the Inovio API request
    const requestData = {
      // ----------------------------------------------------------------
      // AUTHENTICATION - Required for all requests
      // ----------------------------------------------------------------
      req_username: credentials.username,
      req_password: credentials.password,

      // ----------------------------------------------------------------
      // TRANSACTION TYPE - CCAUTHCAP = Authorize and Capture
      // ----------------------------------------------------------------
      request_action: 'CCAUTHCAP',

      // ----------------------------------------------------------------
      // API CONFIGURATION
      // ----------------------------------------------------------------
      site_id: credentials.siteId,
      request_response_format: 'JSON',
      request_api_version: '4.12',

      // ----------------------------------------------------------------
      // PAYMENT DATA - Card information
      // ----------------------------------------------------------------
      pmt_numb: payment.cardNumber,
      pmt_expiry: payment.expiryDate,
      pmt_key: payment.cvv,                   // CVV required for initial payment

      // ----------------------------------------------------------------
      // CUSTOMER DATA
      // ----------------------------------------------------------------
      cust_fname: payment.firstName,
      cust_lname: payment.lastName,
      cust_email: payment.email,

      // ----------------------------------------------------------------
      // BILLING DATA
      // ----------------------------------------------------------------
      bill_addr: payment.billingAddress,
      bill_addr_city: payment.billingCity,
      bill_addr_state: payment.billingState,
      bill_addr_zip: payment.billingZip,
      bill_addr_country: payment.billingCountry,

      // ----------------------------------------------------------------
      // LINE ITEM DATA
      // ----------------------------------------------------------------
      li_prod_id_1: credentials.productId,
      li_value_1: payment.amount,
      li_count_1: 1
    };

    // Add optional parameters
    if (credentials.merchantAccountId) {
      requestData.merch_acct_id = credentials.merchantAccountId;
    }

    if (credentials.disableScrub) {
      requestData.REQUEST_SCRUB_FLAG = '0';
    }

    // Send request to Inovio
    const response = await inovioClient.processPayment(requestData);

    // ----------------------------------------------------------------
    // EXTRACT CUST_ID - CRITICAL FOR SHOPIFY
    // ----------------------------------------------------------------
    // This is the unique identifier that Shopify needs to vault the card.
    // CUST_ID is returned by Inovio and should be sent to Shopify as the
    // "Network Transaction ID". This approach is backwards compatible with
    // all processors, including those that don't support NETWORK TRANSACTION IDs yet.
    const networkTransactionId = response.CUST_ID;

    // ----------------------------------------------------------------
    // SHOPIFY INTEGRATION POINT
    // ----------------------------------------------------------------
    // When returning the response to Shopify:
    // 1. Check if payment was approved (response.TRANS_STATUS_NAME === "APPROVED")
    // 2. If approved, return the CUST_ID to Shopify as the "Network Transaction ID"
    // 3. Shopify will store this ID and associate it with the customer's subscription
    // 4. For all future renewals, Shopify will send you this CUST_ID (not the CVV)
    //
    // IMPORTANT: Without this CUST_ID, subscription renewals will fail!
    // ----------------------------------------------------------------

    res.json({
      success: true,
      request: requestData,
      response: response,
      networkTransactionId: networkTransactionId  // Send this back to Shopify
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

// ============================================================================
// FLOW 3: SUBSCRIPTION RENEWAL PAYMENT
// ============================================================================
/**
 * Subscription Renewal Payment Endpoint
 *
 * PURPOSE:
 * Process recurring subscription payments using the CUST_ID
 * from the initial payment. This flow does NOT require the CVV.
 *
 * SHOPIFY INTEGRATION:
 * - When a subscription renews, Shopify sends you:
 *   1. Card number (PAN)
 *   2. Expiry date
 *   3. Network Transaction ID (which is the CUST_ID from the initial payment)
 *   4. **NO CVV** - Shopify doesn't store CVV for security reasons
 *
 * - Send the transaction to Inovio with REQUEST_ACTION=CCAUTHCAP and REQUEST_REBILL=1
 * - Include the CUST_ID parameter (sent by Shopify as "Network Transaction ID")
 * - Inovio will process the payment without requiring CVV
 *
 * KEY PARAMETERS:
 * - REQUEST_ACTION: CCAUTHCAP (authorize and capture)
 * - REQUEST_REBILL: "1" (indicates this is a renewal payment)
 * - CUST_ID: The customer ID from the initial payment (sent by Shopify as Network Transaction ID)
 * - pmt_numb: Card number (PAN)
 * - pmt_expiry: Expiry date
 * - **NO pmt_key (CVV)** - Not required for renewals
 *
 * IMPORTANT NOTES:
 * - The CUST_ID must match the customer being charged
 * - If the customer updated their card, you need to run a new initial payment
 *   or zero-dollar authorization to get a new CUST_ID
 * - Do NOT send CVV in renewal requests - it's not needed and may cause errors
 * - This approach is backwards compatible with processors that don't support NETWORK TRANSACTION IDs yet
 */
app.post('/api/subscription-renewal', async (req, res) => {
  try {
    const { credentials, payment } = req.body;

    // Build the Inovio API request
    const requestData = {
      // ----------------------------------------------------------------
      // AUTHENTICATION
      // ----------------------------------------------------------------
      req_username: credentials.username,
      req_password: credentials.password,

      // ----------------------------------------------------------------
      // TRANSACTION TYPE
      // ----------------------------------------------------------------
      request_action: 'CCAUTHCAP',

      // ----------------------------------------------------------------
      // API CONFIGURATION
      // ----------------------------------------------------------------
      site_id: credentials.siteId,
      request_response_format: 'JSON',
      request_api_version: '4.12',

      // ----------------------------------------------------------------
      // PAYMENT DATA - Card information (NO CVV for renewals)
      // ----------------------------------------------------------------
      pmt_numb: payment.cardNumber,           // Card number (PAN)
      pmt_expiry: payment.expiryDate,         // Expiry date
      // NOTE: pmt_key (CVV) is NOT included for renewal payments

      // ----------------------------------------------------------------
      // CUST_ID - This replaces the CVV
      // ----------------------------------------------------------------
      // This is the CUST_ID that was returned from the initial subscription payment.
      // Shopify sends this to you as the "Network Transaction ID" with each renewal request.
      CUST_ID: payment.networkTransactionId,

      // ----------------------------------------------------------------
      // CUSTOMER DATA
      // ----------------------------------------------------------------
      cust_fname: payment.firstName,
      cust_lname: payment.lastName,
      cust_email: payment.email,

      // ----------------------------------------------------------------
      // LINE ITEM DATA
      // ----------------------------------------------------------------
      li_prod_id_1: credentials.productId,
      li_value_1: payment.amount,
      li_count_1: 1,

      // ----------------------------------------------------------------
      // SUBSCRIPTION RENEWAL FLAG
      // ----------------------------------------------------------------
      request_rebill: '1'                     // "1" = Renewal payment
    };

    // Add optional parameters
    if (credentials.merchantAccountId) {
      requestData.merch_acct_id = credentials.merchantAccountId;
    }

    if (credentials.disableScrub) {
      requestData.REQUEST_SCRUB_FLAG = '0';
    }

    // Send request to Inovio
    const response = await inovioClient.processPayment(requestData);

    // ----------------------------------------------------------------
    // SHOPIFY INTEGRATION POINT
    // ----------------------------------------------------------------
    // For renewal payments, you only need to check if the payment succeeded.
    // No need to extract the CUST_ID - you already have it from the initial payment.
    //
    // Return success/failure to Shopify:
    // - If APPROVED: Subscription continues, customer is charged
    // - If DECLINED: Shopify will retry based on their retry logic,
    //                or mark the subscription as payment failed
    // ----------------------------------------------------------------

    res.json({
      success: true,
      request: requestData,
      response: response
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

// ============================================================================
// FLOW 4: ZERO-DOLLAR AUTHORIZATION (CARD UPDATE)
// ============================================================================
/**
 * Zero-Dollar Authorization Endpoint
 *
 * PURPOSE:
 * Validate a new card without charging the customer. This is used when a
 * customer updates their payment method for an existing subscription.
 *
 * SHOPIFY INTEGRATION:
 * - When a customer wants to update their card for a subscription, use this flow
 * - Send a $0.00 authorization to Inovio with REQUEST_ACTION=CCAUTHORIZE
 * - Extract CUST_ID from the response
 * - **CRITICAL**: Return this new CUST_ID to Shopify as the "Network Transaction ID"
 * - Shopify will update their records and use this new ID for future renewals
 *
 * KEY PARAMETERS:
 * - REQUEST_ACTION: CCAUTHORIZE (authorization only, no capture)
 * - LI_VALUE_1: "0.00" (zero-dollar amount)
 * - All standard card, customer, and billing fields
 * - CVV is required (just like a regular transaction)
 *
 * CUST_ID (Network Transaction ID for Shopify):
 * Just like the initial subscription payment, this flow returns a CUST_ID which
 * you return to Shopify as the "Network Transaction ID". This new ID should
 * replace the old one in Shopify's records. This approach is backwards compatible
 * with processors that don't support NETWORK TRANSACTION IDs yet.
 *
 * IMPORTANT NOTES:
 * - The card is validated but not charged
 * - A $0.00 authorization may appear on the customer's statement temporarily
 * - Some card issuers don't support $0.00 authorizations - check with Inovio
 * - This is the recommended way to update cards vs. running a small charge
 */
app.post('/api/card-update', async (req, res) => {
  try {
    const { credentials, payment } = req.body;

    // Build the Inovio API request
    const requestData = {
      // ----------------------------------------------------------------
      // AUTHENTICATION
      // ----------------------------------------------------------------
      req_username: credentials.username,
      req_password: credentials.password,

      // ----------------------------------------------------------------
      // TRANSACTION TYPE - CCAUTHORIZE (auth only, no capture)
      // ----------------------------------------------------------------
      // IMPORTANT: Use CCAUTHORIZE (not CCAUTHCAP) for zero-dollar auth
      request_action: 'CCAUTHORIZE',

      // ----------------------------------------------------------------
      // API CONFIGURATION
      // ----------------------------------------------------------------
      site_id: credentials.siteId,
      request_response_format: 'JSON',
      request_api_version: '4.12',

      // ----------------------------------------------------------------
      // PAYMENT DATA - Card information
      // ----------------------------------------------------------------
      pmt_numb: payment.cardNumber,
      pmt_expiry: payment.expiryDate,
      pmt_key: payment.cvv,                   // CVV required for card validation

      // ----------------------------------------------------------------
      // CUSTOMER DATA
      // ----------------------------------------------------------------
      cust_fname: payment.firstName,
      cust_lname: payment.lastName,
      cust_email: payment.email,

      // ----------------------------------------------------------------
      // BILLING DATA
      // ----------------------------------------------------------------
      bill_addr: payment.billingAddress,
      bill_addr_city: payment.billingCity,
      bill_addr_state: payment.billingState,
      bill_addr_zip: payment.billingZip,
      bill_addr_country: payment.billingCountry,

      // ----------------------------------------------------------------
      // ZERO-DOLLAR AMOUNT - This validates the card without charging
      // ----------------------------------------------------------------
      li_prod_id_1: credentials.productId,
      li_value_1: '0.00',                     // Zero dollars
      li_count_1: 1
    };

    // Add optional parameters
    if (credentials.merchantAccountId) {
      requestData.merch_acct_id = credentials.merchantAccountId;
    }

    if (credentials.disableScrub) {
      requestData.REQUEST_SCRUB_FLAG = '0';
    }

    // Send request to Inovio
    const response = await inovioClient.processPayment(requestData);

    // ----------------------------------------------------------------
    // EXTRACT CUST_ID - CRITICAL FOR SHOPIFY
    // ----------------------------------------------------------------
    // This is the new CUST_ID for the updated card.
    // CUST_ID is returned by Inovio and should be sent to Shopify as the
    // "Network Transaction ID". This approach is backwards compatible with
    // all processors, including those that don't support NETWORK TRANSACTION IDs yet.
    const networkTransactionId = response.CUST_ID;

    // ----------------------------------------------------------------
    // SHOPIFY INTEGRATION POINT
    // ----------------------------------------------------------------
    // When returning the response to Shopify:
    // 1. Check if authorization was approved (response.TRANS_STATUS_NAME === "APPROVED")
    // 2. If approved, return the new CUST_ID to Shopify as the "Network Transaction ID"
    // 3. Shopify will update the subscription with this new CUST_ID
    // 4. Future renewals will use this new CUST_ID (not the old one)
    //
    // IMPORTANT: This new CUST_ID is associated with the new card, not the old card.
    // Make sure Shopify replaces the old CUST_ID with this new one.
    // ----------------------------------------------------------------

    res.json({
      success: true,
      request: requestData,
      response: response,
      networkTransactionId: networkTransactionId  // Send this back to Shopify
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`Bankful - Inovio Payment Demo Server running on port ${PORT}`);
  console.log(`Open your browser to http://localhost:${PORT}`);
});
