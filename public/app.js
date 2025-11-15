// Tab switching functionality
document.addEventListener('DOMContentLoaded', () => {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;

            // Remove active class from all buttons and panes
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));

            // Add active class to clicked button and corresponding pane
            button.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
        });
    });

    // Form submissions
    document.getElementById('oneTimeForm').addEventListener('submit', handleOneTimePayment);
    document.getElementById('subscriptionInitialForm').addEventListener('submit', handleSubscriptionInitial);
    document.getElementById('subscriptionRenewalForm').addEventListener('submit', handleSubscriptionRenewal);
    document.getElementById('cardUpdateForm').addEventListener('submit', handleCardUpdate);
});

// Get card and billing details from global fields
function getCardAndBillingDetails() {
    return {
        cardNumber: document.getElementById('global-cardNumber').value,
        expiryDate: document.getElementById('global-expiryDate').value,
        cvv: document.getElementById('global-cvv').value,
        firstName: document.getElementById('global-firstName').value,
        lastName: document.getElementById('global-lastName').value,
        email: document.getElementById('global-email').value,
        billingAddress: document.getElementById('global-billingAddress').value,
        billingCity: document.getElementById('global-billingCity').value,
        billingState: document.getElementById('global-billingState').value,
        billingZip: document.getElementById('global-billingZip').value,
        billingCountry: document.getElementById('global-billingCountry').value
    };
}

// Get credentials from the global form
function getCredentials() {
    const merchantAccountId = document.getElementById('merchantAccountId').value.trim();
    return {
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
        siteId: document.getElementById('siteId').value,
        merchantAccountId: merchantAccountId || null, // null if empty
        productId: document.getElementById('productId').value,
        disableScrub: document.getElementById('disableScrub').checked
    };
}

// Validate credentials
function validateCredentials(credentials) {
    const missing = [];
    if (!credentials.username) missing.push('API Username');
    if (!credentials.password) missing.push('API Password');
    if (!credentials.siteId) missing.push('Site ID');
    // merchantAccountId is now optional
    if (!credentials.productId) missing.push('Product ID');

    if (missing.length > 0) {
        alert(`Please fill in the following credentials at the top:\n- ${missing.join('\n- ')}`);
        return false;
    }
    return true;
}

// Handle One-Time Payment
async function handleOneTimePayment(e) {
    e.preventDefault();

    const credentials = getCredentials();
    if (!validateCredentials(credentials)) return;

    const cardAndBilling = getCardAndBillingDetails();
    const payment = {
        ...cardAndBilling,
        amount: document.getElementById('ot-amount').value
    };

    const resultContainer = document.getElementById('oneTimeResult');
    const resultOutput = document.getElementById('oneTimeOutput');

    resultContainer.style.display = 'block';
    resultOutput.innerHTML = '<div class="loading">Processing payment</div>';

    try {
        const response = await fetch('/api/one-time', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credentials, payment })
        });

        const data = await response.json();

        if (data.success) {
            resultOutput.innerHTML = formatSuccessResponse(data, 'one-time');
        } else {
            resultOutput.innerHTML = formatErrorResponse(data);
        }
    } catch (error) {
        resultOutput.innerHTML = formatErrorResponse({ error: error.message });
    }
}

// Handle Subscription Initial Payment
async function handleSubscriptionInitial(e) {
    e.preventDefault();

    const credentials = getCredentials();
    if (!validateCredentials(credentials)) return;

    const cardAndBilling = getCardAndBillingDetails();
    const payment = {
        ...cardAndBilling,
        amount: document.getElementById('si-amount').value
    };

    const resultContainer = document.getElementById('subscriptionInitialResult');
    const resultOutput = document.getElementById('subscriptionInitialOutput');

    resultContainer.style.display = 'block';
    resultOutput.innerHTML = '<div class="loading">Processing initial subscription payment</div>';

    try {
        const response = await fetch('/api/subscription-initial', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credentials, payment })
        });

        const data = await response.json();

        if (data.success) {
            resultOutput.innerHTML = formatSuccessResponse(data, 'subscription-initial');

            // Auto-fill renewal form with Network Transaction ID and amount
            if (data.networkTransactionId) {
                const networkIdField = document.getElementById('sr-networkTransactionId');
                const amountField = document.getElementById('sr-amount');

                // Fill the fields
                networkIdField.value = data.networkTransactionId;
                amountField.value = payment.amount;

                // Add success message
                const step2Section = document.querySelector('.subscription-step:nth-of-type(2)');
                const existingMessage = step2Section.querySelector('.success-message');
                if (existingMessage) existingMessage.remove();

                const successMessage = document.createElement('div');
                successMessage.className = 'success-message';
                successMessage.innerHTML = '✓ Step 2 is ready! Network Transaction ID and amount have been auto-filled.';
                step2Section.insertBefore(successMessage, step2Section.querySelector('form'));

                // Add highlight animation to the Network Transaction ID field
                networkIdField.classList.add('auto-filled');
                setTimeout(() => networkIdField.classList.remove('auto-filled'), 2000);

                // Scroll to Step 2
                setTimeout(() => {
                    step2Section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 300);
            }
        } else {
            resultOutput.innerHTML = formatErrorResponse(data);
        }
    } catch (error) {
        resultOutput.innerHTML = formatErrorResponse({ error: error.message });
    }
}

// Handle Subscription Renewal Payment
async function handleSubscriptionRenewal(e) {
    e.preventDefault();

    const credentials = getCredentials();
    if (!validateCredentials(credentials)) return;

    const cardAndBilling = getCardAndBillingDetails();
    const payment = {
        cardNumber: cardAndBilling.cardNumber,
        expiryDate: cardAndBilling.expiryDate,
        networkTransactionId: document.getElementById('sr-networkTransactionId').value,
        amount: document.getElementById('sr-amount').value,
        firstName: cardAndBilling.firstName,
        lastName: cardAndBilling.lastName,
        email: cardAndBilling.email
    };

    const resultContainer = document.getElementById('subscriptionRenewalResult');
    const resultOutput = document.getElementById('subscriptionRenewalOutput');

    resultContainer.style.display = 'block';
    resultOutput.innerHTML = '<div class="loading">Processing renewal payment</div>';

    try {
        const response = await fetch('/api/subscription-renewal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credentials, payment })
        });

        const data = await response.json();

        if (data.success) {
            resultOutput.innerHTML = formatSuccessResponse(data, 'subscription-renewal');
        } else {
            resultOutput.innerHTML = formatErrorResponse(data);
        }
    } catch (error) {
        resultOutput.innerHTML = formatErrorResponse({ error: error.message });
    }
}

// Handle Card Update (Zero-Dollar Authorization)
async function handleCardUpdate(e) {
    e.preventDefault();

    const credentials = getCredentials();
    if (!validateCredentials(credentials)) return;

    const payment = getCardAndBillingDetails();

    const resultContainer = document.getElementById('cardUpdateResult');
    const resultOutput = document.getElementById('cardUpdateOutput');

    resultContainer.style.display = 'block';
    resultOutput.innerHTML = '<div class="loading">Processing zero-dollar authorization</div>';

    try {
        const response = await fetch('/api/card-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credentials, payment })
        });

        const data = await response.json();

        if (data.success) {
            resultOutput.innerHTML = formatSuccessResponse(data, 'card-update');
        } else {
            resultOutput.innerHTML = formatErrorResponse(data);
        }
    } catch (error) {
        resultOutput.innerHTML = formatErrorResponse({ error: error.message });
    }
}

// Format success response
function formatSuccessResponse(data, flowType) {
    let html = '';

    // Network Transaction ID highlight for subscription and card update flows
    if (flowType === 'subscription-initial' || flowType === 'card-update') {
        if (data.networkTransactionId) {
            html += `
                <div class="highlight-box">
                    <strong>✓ Network Transaction ID (for Shopify):</strong>
                    <p style="font-family: monospace; font-size: 1.3rem; margin-top: 10px; font-weight: bold;">
                        ${data.networkTransactionId}
                    </p>
                    <button onclick="navigator.clipboard.writeText('${data.networkTransactionId}').then(() => alert('Network Transaction ID copied to clipboard!'))"
                            style="margin-top: 10px; padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">
                        Copy to Clipboard
                    </button>
                    <p style="margin-top: 10px; font-size: 0.95rem;">
                        ${flowType === 'subscription-initial'
                            ? '<strong>This value has been automatically filled into Step 2 below.</strong> Shopify will vault this card using this Network Transaction ID for future renewals.'
                            : 'Shopify will use this Network Transaction ID to update the card on file for subscriptions.'}
                    </p>
                </div>
            `;
        }
    }

    // Request section
    html += `
        <div class="result-section">
            <h4>Request Sent to Inovio</h4>
            <div class="json-display">${JSON.stringify(data.request, null, 2)}</div>
        </div>
    `;

    // Response section
    html += `
        <div class="result-section">
            <h4>Response from Inovio</h4>
            <div class="json-display">${JSON.stringify(data.response, null, 2)}</div>
        </div>
    `;

    // Key fields explanation
    if (data.response) {
        html += '<div class="result-section"><h4>Key Response Fields</h4>';
        html += '<div style="background: white; padding: 15px; border-radius: 6px; border: 1px solid #dee2e6;">';

        if (data.response.TRANS_STATUS_NAME) {
            html += `<p><strong>Transaction Status:</strong> ${data.response.TRANS_STATUS_NAME}</p>`;
        }
        if (data.response.TRANS_ID) {
            html += `<p><strong>Transaction ID:</strong> ${data.response.TRANS_ID}</p>`;
        }
        if (data.response.TRANS_VALUE) {
            html += `<p><strong>Amount:</strong> ${data.response.TRANS_VALUE} ${data.response.CURR_CODE_ALPHA || ''}</p>`;
        }
        if (data.response.PROC_AUTH_RESPONSE) {
            html += `<p><strong>Processor Auth Code:</strong> ${data.response.PROC_AUTH_RESPONSE}</p>`;
        }
        if (data.response.CARD_BRAND_TRANSID) {
            html += `<p><strong>Card Brand Transaction ID:</strong> ${data.response.CARD_BRAND_TRANSID}</p>`;
        }
        if (data.response.PROC_REFERENCE_NUM) {
            html += `<p><strong>Processor Reference Number:</strong> ${data.response.PROC_REFERENCE_NUM}</p>`;
        }

        html += '</div></div>';
    }

    // Flow-specific notes
    if (flowType === 'one-time') {
        html += `
            <div class="result-section">
                <h4>For Shopify Integration</h4>
                <div style="background: #e7f3ff; padding: 15px; border-radius: 6px; border-left: 4px solid #2196f3;">
                    <p>✓ Simply notify Shopify of the transaction status (success/failure).</p>
                    <p>✓ No Network Transaction ID is needed for one-time payments.</p>
                </div>
            </div>
        `;
    } else if (flowType === 'subscription-renewal') {
        html += `
            <div class="result-section">
                <h4>For Shopify Integration</h4>
                <div style="background: #e7f3ff; padding: 15px; border-radius: 6px; border-left: 4px solid #2196f3;">
                    <p>✓ Renewal processed using the Network Transaction ID from the initial subscription.</p>
                    <p>✓ Notice: CVV was NOT required for this renewal payment.</p>
                    <p>✓ Shopify sends the PAN + Network Transaction ID for renewals.</p>
                </div>
            </div>
        `;
    }

    return html;
}

// Format error response
function formatErrorResponse(data) {
    let html = `
        <div class="error-box">
            <h4>Error Processing Payment</h4>
            <p><strong>Error:</strong> ${data.error || 'Unknown error'}</p>
    `;

    if (data.details) {
        html += `
            <p style="margin-top: 10px;"><strong>Details:</strong></p>
            <div class="json-display" style="margin-top: 10px;">
                ${JSON.stringify(data.details, null, 2)}
            </div>
        `;
    }

    html += '</div>';
    return html;
}
