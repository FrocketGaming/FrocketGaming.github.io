const quoteCheckbox = document.getElementById('quote');
const parenthesisCheckbox = document.getElementById('parenthesis');
const formatSQLCheckbox = document.getElementById('formatSQL');
const options = document.querySelector('.options');
const output = document.getElementById('output');
const copyButton = document.getElementById('copyButton'); // Assume you have a button with this ID
const popup = document.querySelector('.copy-popup');

// Function to update the copy button state
function updateCopyButtonState() {
    if (output.value.trim() === '') {
        copyButton.disabled = true;
        copyButton.classList.add('disabled'); // Add a CSS class for styling if needed
    } else {
        copyButton.disabled = false;
        copyButton.classList.remove('disabled');
    }
}

// Add event listener to the output box
output.addEventListener('input', updateCopyButtonState);

// Initial call to set the correct state when the page loads
updateCopyButtonState();

formatSQLCheckbox.addEventListener('change', function() {
    if (this.checked) {
        options.classList.add('disabled');
        quoteCheckbox.checked = false;
        parenthesisCheckbox.checked = false;
        quoteCheckbox.disabled = true;
        parenthesisCheckbox.disabled = true;
    } else {
        options.classList.remove('disabled');
        quoteCheckbox.disabled = false;
        parenthesisCheckbox.disabled = false;
    }
});

quoteCheckbox.addEventListener('change', function() {
    if (this.checked) {
        formatSQLCheckbox.checked = false;
        enableCheckboxes();
    }
});

parenthesisCheckbox.addEventListener('change', function() {
    if (this.checked) {
        formatSQLCheckbox.checked = false;
        enableCheckboxes();
    }
});

function enableCheckboxes() {
    options.classList.remove('disabled');
    quoteCheckbox.disabled = false;
    parenthesisCheckbox.disabled = false;
}

function formatInput() {
    const input = document.getElementById('input').value;
    const quote = quoteCheckbox.checked;
    const parenthesis = parenthesisCheckbox.checked;
    const formatSQL = formatSQLCheckbox.checked;
    
    let result;

    if (formatSQL) {
        result = formatSQLQuery(input);
    } else {
        // Always split by both commas and whitespace
        let items = input.split(/[,\s]+/).filter(item => item.trim() !== '');
        
        if (quote) {
            items = items.map(item => `'${item}'`);
        }
        
        result = items.join(', ');
        
        if (parenthesis) {
            result = `(${result})`;
        }
    }
    
    output.value = result;
    updateCopyButtonState(); // Update copy button state after formatting
}

function formatSQLQuery(query) {
    const keywords = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'ORDER BY', 'GROUP BY', 'HAVING', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'OUTER JOIN', 'ON', 'IN', 'UNION', 'ALL', 'INSERT', 'UPDATE', 'DELETE'];
    
    let formattedQuery = query.toUpperCase();

    // Replace multiple spaces with a single space
    formattedQuery = formattedQuery.replace(/\s+/g, ' ');

    keywords.forEach(keyword => {
        formattedQuery = formattedQuery.replace(new RegExp(`\\b${keyword}\\b`, 'g'), `\n${keyword}`);
    });

    // Remove empty lines and trim each line
    formattedQuery = formattedQuery.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');

    return formattedQuery;
}

function clearOutput() {
    output.value = '';
    updateCopyButtonState(); // Update copy button state after clearing
}

function copyToClipboard() {
    if (output.value.trim() === '') return; // Exit if output is empty

    // Create a temporary textarea element to copy from
    const tempTextArea = document.createElement('textarea');
    tempTextArea.value = output.value;
    document.body.appendChild(tempTextArea);
    
    // Copy the text without visual selection
    tempTextArea.select();
    document.execCommand('copy');
    
    // Remove the temporary textarea
    document.body.removeChild(tempTextArea);

    // Show the popup
    popup.classList.add('show');
    setTimeout(() => {
        popup.classList.remove('show');
    }, 2000);
}

// Add click event listener to the copy button
copyButton.addEventListener('click', copyToClipboard);