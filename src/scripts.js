const popupData = {
    'cart': {
        title: 'CART (Classification and Regression Trees)',
        description: "CART is like a big game of 20 questions. It asks yes/no questions about your data to figure out what group it belongs to or what number it might be.",
        advanced: "CART uses a recursive partitioning algorithm to create a decision tree. It selects the best feature and threshold to split the data at each node, maximizing information gain or minimizing impurity."
    },
    'random-forest': {
        title: 'Random Forest',
        description: "Random Forest is like asking a bunch of friends to play 20 questions, and then going with what most of them think is the right answer.",
        advanced: "Random Forest is an ensemble method that creates multiple decision trees using bootstrap sampling and random feature selection. It aggregates the predictions of all trees to make a final prediction, reducing overfitting and improving generalization."
    }
};

function showPopup(type) {
    const popup = document.getElementById('popup');
    const title = document.getElementById('popup-title');
    const description = document.getElementById('popup-description');
    const advanced = document.getElementById('popup-advanced');

    title.textContent = popupData[type].title;
    description.textContent = popupData[type].description;
    advanced.textContent = popupData[type].advanced;
    advanced.style.display = 'none';

    popup.style.display = 'block';
}

function closePopup() {
    document.getElementById('popup').style.display = 'none';
}

function toggleAdvanced() {
    const advanced = document.getElementById('popup-advanced');
    advanced.style.display = advanced.style.display === 'none' ? 'block' : 'none';
}