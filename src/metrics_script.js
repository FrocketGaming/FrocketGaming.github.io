// src/metrics_script.js

document.addEventListener('DOMContentLoaded', function() {
    const formulas = document.querySelectorAll('.katex');
    formulas.forEach(formula => {
        katex.render(formula.textContent, formula, {
            throwOnError: false,
            displayMode: true
        });
    });
});