/**
 * ============================================================================
 * INOVIO PAYMENT API CLIENT
 * ============================================================================
 *
 * This module provides a simple wrapper for making requests to the Inovio
 * payment gateway API.
 *
 * IMPORTANT FOR ANN'S TEAM:
 * This shows how to format and send requests to Inovio's API. The key points:
 *
 * 1. CONTENT TYPE: Inovio expects application/x-www-form-urlencoded (not JSON)
 * 2. RESPONSE FORMAT: Request JSON responses with request_response_format=JSON
 * 3. TIMEOUT: Use 120 seconds (2 minutes) as recommended in Inovio docs
 * 4. ERROR HANDLING: Check for different error types (response, request, setup)
 *
 * API ENDPOINT: https://api.inoviopay.com/payment/pmt_service.cfm
 *
 * ============================================================================
 */

const axios = require('axios');

// Inovio Payment API endpoint
const INOVIO_API_URL = 'https://api.inoviopay.com/payment/pmt_service.cfm';

/**
 * Process a payment through the Inovio API
 *
 * This function takes a JavaScript object with payment parameters, converts it
 * to URL-encoded format, and sends it to Inovio's API endpoint.
 *
 * @param {Object} requestData - Payment request parameters
 * @param {string} requestData.req_username - Inovio API username
 * @param {string} requestData.req_password - Inovio API password
 * @param {string} requestData.request_action - Action type (CCAUTHCAP, CCAUTHORIZE, etc.)
 * @param {string} requestData.site_id - Inovio site ID
 * @param {string} requestData.pmt_numb - Card number (PAN)
 * @param {string} requestData.pmt_expiry - Expiry date (MMYYYY format)
 * @param {string} requestData.pmt_key - CVV (optional for renewals)
 * @param {string} requestData.li_value_1 - Transaction amount (e.g., "19.95")
 * @param {string} requestData.orig_card_brand_transid - Network Transaction ID (for renewals)
 * @param {string} requestData.request_rebill - Subscription flag ("1"=initial, "2"=renewal)
 * @param {...*} requestData - Additional parameters as needed
 *
 * @returns {Promise<Object>} - Parsed JSON response from Inovio
 *
 * @throws {Error} - If the request fails or Inovio returns an error
 *
 * EXAMPLE USAGE:
 *
 * const requestData = {
 *   req_username: 'your_username',
 *   req_password: 'your_password',
 *   request_action: 'CCAUTHCAP',
 *   site_id: '12345',
 *   request_response_format: 'JSON',
 *   request_api_version: '4.12',
 *   pmt_numb: '4111111111111111',
 *   pmt_expiry: '122030',
 *   pmt_key: '123',
 *   li_value_1: '29.95',
 *   request_rebill: '1'
 * };
 *
 * const response = await processPayment(requestData);
 * const networkTransactionId = response.CARD_BRAND_TRANSID;
 */
async function processPayment(requestData) {
  try {
    // ----------------------------------------------------------------
    // STEP 1: Convert request data to URL-encoded format
    // ----------------------------------------------------------------
    // Inovio's API expects application/x-www-form-urlencoded format,
    // not JSON. We use URLSearchParams to build the proper format.
    const params = new URLSearchParams();

    // Add each parameter to the URLSearchParams object
    // Skip null, undefined, or empty string values
    for (const [key, value] of Object.entries(requestData)) {
      if (value !== null && value !== undefined && value !== '') {
        params.append(key, value);
      }
    }

    // ----------------------------------------------------------------
    // STEP 2: Send POST request to Inovio API
    // ----------------------------------------------------------------
    const response = await axios.post(INOVIO_API_URL, params.toString(), {
      headers: {
        // CRITICAL: Must use application/x-www-form-urlencoded
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      // RECOMMENDED: 120 second timeout per Inovio API documentation
      // Payment processing can take time, especially for 3DS transactions
      timeout: 120000
    });

    // ----------------------------------------------------------------
    // STEP 3: Parse and return the response
    // ----------------------------------------------------------------
    // Inovio should return JSON if request_response_format=JSON was set,
    // but sometimes it comes as a string that needs parsing
    if (typeof response.data === 'string') {
      try {
        return JSON.parse(response.data);
      } catch (e) {
        // If JSON parsing fails, return the raw string
        // This shouldn't happen with request_response_format=JSON
        return response.data;
      }
    }

    // Response is already an object, return it
    return response.data;

  } catch (error) {
    // ----------------------------------------------------------------
    // ERROR HANDLING
    // ----------------------------------------------------------------
    // There are three types of errors we need to handle:

    // 1. Server responded with an error status (4xx or 5xx)
    if (error.response) {
      throw new Error(
        `Inovio API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`
      );
    }

    // 2. Request was sent but no response received (network issue)
    else if (error.request) {
      throw new Error(
        'No response from Inovio API - please check network connectivity'
      );
    }

    // 3. Error occurred while setting up the request
    else {
      throw new Error(`Request setup error: ${error.message}`);
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  processPayment
};

// ============================================================================
// INTEGRATION NOTES FOR ANN'S TEAM
// ============================================================================
/**
 * PRODUCTION RECOMMENDATIONS:
 *
 * 1. SECURITY:
 *    - Never log or store CVV codes
 *    - Use HTTPS for all communication (Inovio API uses HTTPS)
 *    - Store API credentials securely (environment variables, secrets manager)
 *    - Implement PCI-DSS compliance measures
 *
 * 2. ERROR HANDLING:
 *    - Add retry logic for network errors (with exponential backoff)
 *    - Log all transaction attempts for auditing
 *    - Handle specific Inovio error codes (TRANS_STATUS_NAME, SERVICE_RESPONSE)
 *    - Implement proper error messages for customers
 *
 * 3. MONITORING:
 *    - Track success/failure rates
 *    - Monitor API response times
 *    - Set up alerts for high failure rates
 *    - Log Network Transaction IDs for troubleshooting
 *
 * 4. TESTING:
 *    - Use Inovio test cards in development: 4111111111111111
 *    - Test all three flows (one-time, subscription, card update)
 *    - Test failure scenarios (declined cards, network errors)
 *    - Verify Network Transaction ID is returned and stored correctly
 *
 * 5. SHOPIFY INTEGRATION:
 *    - Store Network Transaction IDs in your database
 *    - Associate Network Transaction IDs with Shopify customer IDs
 *    - Handle card updates properly (replace old Network Transaction ID)
 *    - Implement webhook handlers for Shopify subscription events
 *
 * 6. PARAMETER NOTES:
 *    - request_rebill: "1" for initial subscription, "2" for renewals
 *    - orig_card_brand_transid: Only for renewals, not initial payments
 *    - REQUEST_SCRUB_FLAG: "0" for testing only, remove in production
 *    - merch_acct_id: Optional, Inovio uses default if not provided
 *    - pmt_key (CVV): Required for initial payments, NOT for renewals
 *
 * 7. RESPONSE FIELDS TO CHECK:
 *    - TRANS_STATUS_NAME: "APPROVED", "DECLINED", etc.
 *    - CARD_BRAND_TRANSID: Network Transaction ID (priority 1)
 *    - PROC_REFERENCE_NUM: Network Transaction ID (priority 2)
 *    - PROC_RETRIEVAL_NUM: Network Transaction ID (priority 3)
 *    - SERVICE_RESPONSE: Error code if transaction failed
 *    - SERVICE_ADVICE: Error message/description
 *    - TRANS_ID: Inovio's internal transaction ID
 *
 * COMMON ERRORS AND SOLUTIONS:
 *
 * - Error 700 (Scrub Decline): Fraud screening blocked the transaction
 *   Solution: Set REQUEST_SCRUB_FLAG=0 for testing, review fraud rules for production
 *
 * - Error 707 (Invalid CPF): Brazilian merchant account requires CPF
 *   Solution: Ensure correct merchant account ID, or leave blank for default
 *
 * - "No Network Transaction ID": Processor doesn't support tokenization
 *   Solution: Check with Inovio that your processor supports subscription vaulting
 *
 * - Timeout errors: Payment took longer than 120 seconds
 *   Solution: Increase timeout, check with Inovio about processor response times
 *
 * - CVV required on renewal: You sent pmt_key on a renewal request
 *   Solution: Don't send pmt_key for renewals, only orig_card_brand_transid
 */
