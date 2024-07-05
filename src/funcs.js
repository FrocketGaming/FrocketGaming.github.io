const quoteCheckbox = document.getElementById('quote');
        const parenthesisCheckbox = document.getElementById('parenthesis');
        const formatSQLRadio = document.getElementById('formatSQL');
        const options = document.querySelector('.options');

        formatSQLRadio.addEventListener('change', function() {
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
                formatSQLRadio.checked = false;
                enableCheckboxes();
            }
        });

        parenthesisCheckbox.addEventListener('change', function() {
            if (this.checked) {
                formatSQLRadio.checked = false;
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
            const formatSQL = formatSQLRadio.checked;
            
            let result;
        
            if (formatSQL) {
                result = formatSQLQuery(input);
            } else {
                let items = input.split(/[,\n]+/).map(item => item.trim()).filter(item => item !== '');
                
                if (quote) {
                    items = items.map(item => `'${item}'`);
                }
                
                result = items.join(', ');
                
                if (parenthesis) {
                    result = `(${result})`;
                }
                
                // If no formatting options are selected, just return the comma-separated list
                if (!quote && !parenthesis && !formatSQL) {
                    // Check if the input is already a comma-separated list
                    if (input.includes(',')) {
                        result = input.split(',').map(item => item.trim()).join(', ');
                    } else {
                        result = items.join(', ');
                    }
                }
            }
            
            document.getElementById('output').value = result;
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
        document.getElementById('output').value = '';
    }

        function copyToClipboard() {
            const output = document.getElementById('output');
            const popup = document.querySelector('.copy-popup');

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