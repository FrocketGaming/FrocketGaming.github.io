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
    },
    'id3': {
        title: 'ID3 (Iterative Dichotomiser 3)',
        description: "ID3 is like organizing a library by asking questions about book features to group similar books together.",
        advanced: "ID3 builds a decision tree by selecting the attribute with the highest information gain at each node. It uses entropy to measure the impurity of a set of examples."
    },
    'linear-svm': {
        title: 'Linear SVM',
        description: "Linear SVM is like drawing a line on a map to separate two cities, trying to keep the line as far from both cities as possible.",
        advanced: "Linear SVM finds the hyperplane that best separates two classes with the maximum margin. It uses the concept of support vectors to define the decision boundary."
    },
    'kernel-svm': {
        title: 'Kernel SVM',
        description: "Kernel SVM is like using a special lens that makes it easier to separate things that were hard to separate before.",
        advanced: "Kernel SVM uses a kernel function to transform the input space into a higher-dimensional feature space, allowing for non-linear separation of classes."
    },
    'mlp': {
        title: 'Multilayer Perceptron (MLP)',
        description: "MLP is like a group of people passing information to each other, each person making a small decision before passing it on.",
        advanced: "MLP is a feedforward neural network with one or more hidden layers. It uses backpropagation to adjust weights and biases during training."
    },
    'cnn': {
        title: 'Convolutional Neural Network (CNN)',
        description: "CNN is like looking at a picture through different filters to spot important patterns.",
        advanced: "CNN uses convolutional layers to automatically learn hierarchical features from input data, typically used for image recognition tasks."
    },
    'rnn': {
        title: 'Recurrent Neural Network (RNN)',
        description: "RNN is like reading a book and remembering what happened in previous chapters to understand the current one better.",
        advanced: "RNN processes sequential data by maintaining a hidden state that captures information from previous time steps, allowing it to handle inputs of variable length."
    },
    'knn-classification': {
        title: 'KNN Classification',
        description: "KNN Classification is like asking your nearest neighbors what group they belong to and joining the most common group.",
        advanced: "KNN Classification assigns a class label to a new data point based on the majority class of its k nearest neighbors in the feature space."
    },
    'knn-regression': {
        title: 'KNN Regression',
        description: "KNN Regression is like estimating the price of your house based on the average prices of similar houses in your neighborhood.",
        advanced: "KNN Regression predicts the value of a new data point by averaging the values of its k nearest neighbors in the feature space."
    }
};

const popup = document.getElementById('popup');
const popupTitle = document.getElementById('popup-title');
const popupDescription = document.getElementById('popup-description');
const popupAdvanced = document.getElementById('popup-advanced');
const toggleAdvancedBtn = document.getElementById('toggle-advanced');
const closePopupBtn = document.getElementById('close-popup');

function showPopup(type) {
    if (popupData[type]) {
        popupTitle.textContent = popupData[type].title;
        popupDescription.textContent = popupData[type].description;
        popupAdvanced.textContent = popupData[type].advanced;
        popupAdvanced.classList.add('hidden');
        toggleAdvancedBtn.textContent = 'Show Advanced Description';
        popup.style.display = 'block';
    } else {
        console.error(`No data found for type: ${type}`);
    }
}

function closePopup() {
    popup.style.display = 'none';
}

function toggleAdvanced() {
    popupAdvanced.classList.toggle('hidden');
    toggleAdvancedBtn.textContent = popupAdvanced.classList.contains('hidden') ? 
        'Show Advanced Description' : 'Hide Advanced Description';
}

document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => showPopup(btn.dataset.type));
});

closePopupBtn.addEventListener('click', closePopup);
toggleAdvancedBtn.addEventListener('click', toggleAdvanced);

// Close popup when clicking outside the content
popup.addEventListener('click', (e) => {
    if (e.target === popup) {
        closePopup();
    }
});