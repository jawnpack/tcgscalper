// game.js

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBGUqKLyes3vGlx0KXWZXC59LkpKIakcZw",
  authDomain: "tcg-scalper-leaderboard.firebaseapp.com",
  projectId: "tcg-scalper-leaderboard",
  storageBucket: "tcg-scalper-leaderboard.firebasestorage.app",
  messagingSenderId: "85796303216",
  appId: "1:85796303216:web:d8cf90e3fb9c16a54f1fb5",
  measurementId: "G-P03T25QFLT"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const products = [
  "The Base Set",
  "The Nostalgia Set",
  "Dark Flames",
  "Masks of Dawn",
  "Prizms of Change",
  "Inevitable Opponents"
];

const buyLocations = ["Local Game Store", "Cost-Mart", "eCommerce Store"];
const sellLocations = ["The Marketplace", "TCG Convention"];

let state = {
  day: 1,
  money: 1000,
  location: "Local Game Store",
  inventory: {},
  market: {},
  stock: {},
  rumor: "None yet...",
  rumorEffects: {},
  deliveryQueue: [],
  onlineListings: [],
  priceHistory: {},
  soldOutProducts: [],
  rumorsLowStock: null,
  rumorsNoReprint: null,
  rumorsOverprint: null,
  notifications: [],
  timer: null,
  timerDisplay: null,
  timeRemaining: 120, // 2 minutes in seconds
};

products.forEach(p => {
  state.inventory[p] = 0;
  state.priceHistory[p] = [];
});

let marketPrices = {};
let marketStock = {};
let selloutTimer;
let selloutInterval;
let remainingTime = 120; // seconds
let timerPaused = false;
// Game statistics tracking
let gameStats = {
  totalBought: 0,
  totalSold: 0
};

buyLocations.concat(sellLocations).forEach(loc => {
  marketPrices[loc] = {};
  marketStock[loc] = {};
  products.forEach(p => {
    const price = generatePrice(p);
    marketPrices[loc][p] = price;
    marketStock[loc][p] = generateStock(loc);
    if (buyLocations.includes(loc)) {
      state.priceHistory[p].push(price);
    }
  });
});

function generatePrice(product) {
  const day = state.day;
  const tier1 = ["The Base Set", "The Nostalgia Set"];
  const tier2 = ["Dark Flames", "Masks of Dawn"];
  const tier3 = ["Prizms of Change", "Inevitable Opponents"];

  if (tier1.includes(product)) {
    return randomInRange(day <= 15 ? 400 : 600, day <= 15 ? 800 : 1200);
  }
  if (tier2.includes(product)) {
    return randomInRange(day <= 15 ? 80 : 150, day <= 15 ? 250 : 300);
  }
  return randomInRange(day <= 15 ? 120 : 200, day <= 15 ? 300 : 500);
}

function generateStock(location) {
  if (location === "Local Game Store") return randomInRange(8, 12);
  if (location === "Cost-Mart") return randomInRange(3, 6);
  if (location === "eCommerce Store") return randomInRange(1, 15);
  return randomInRange(5, 10);
}

function randomInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Add a notification banner to the page
function showNotification(message, type = "info") {
  const container = document.getElementById("notification-container");
  if (!container) {
    // Create notification container if it doesn't exist
    const notifContainer = document.createElement("div");
    notifContainer.id = "notification-container";
    notifContainer.style.position = "fixed";
    notifContainer.style.top = "10px";
    notifContainer.style.right = "10px";
    notifContainer.style.width = "300px";
    notifContainer.style.zIndex = "1000";
    document.body.appendChild(notifContainer);
  }
  
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.style.padding = "10px";
  notification.style.marginBottom = "10px";
  notification.style.borderRadius = "5px";
  notification.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
  notification.style.animation = "fadeIn 0.5s, fadeOut 0.5s 3.5s";
  
  // Set background color based on type
  if (type === "success") {
    notification.style.backgroundColor = "#d4edda";
    notification.style.borderLeft = "4px solid #28a745";
  } else if (type === "warning") {
    notification.style.backgroundColor = "#fff3cd";
    notification.style.borderLeft = "4px solid #ffc107";
  } else if (type === "error") {
    notification.style.backgroundColor = "#f8d7da";
    notification.style.borderLeft = "4px solid #dc3545";
  } else {
    notification.style.backgroundColor = "#cce5ff";
    notification.style.borderLeft = "4px solid #007bff";
  }
  
  notification.innerHTML = message;
  
  document.getElementById("notification-container").appendChild(notification);
  
  // Remove notification after 4 seconds
  setTimeout(() => {
    notification.remove();
  }, 4000);
}

// Add these style rules for the modal
function addModalStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .modal {
      position: fixed;
      top: 50;
      left: 50;
      width: 80%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 3000;
    }
    
    .modal-content {
      background-color: white;
      padding: 20px;
      border-radius: 5px;
      width: 80%;
      max-width: 500px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    }
    
    #leaderboard-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
      margin-bottom: 15px;
    }
    
    #leaderboard-table th, #leaderboard-table td {
      padding: 8px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    
    #leaderboard-table th {
      background-color: #f2f2f2;
    }
    
    #player-initials {
      padding: 8px;
      margin-right: 10px;
      font-size: 16px;
    }
    
    #submit-score, #play-again {
      padding: 8px 16px;
      background-color: #4CAF50;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      margin-top: 10px;
    }
    
    #submit-score:hover, #play-again:hover {
      background-color: #45a049;
    }
  `;
  document.head.appendChild(style);
}

// Function to create the timer display in the top-right corner
function createTimerDisplay() {
  // Remove existing timer display if any
  if (state.timerDisplay) {
    state.timerDisplay.remove();
  }
  
  const timerDisplay = document.createElement("div");
  timerDisplay.id = "timer-display";
  timerDisplay.style.position = "fixed";
  timerDisplay.style.top = "10px";
  timerDisplay.style.right = "10px";
  timerDisplay.style.backgroundColor = "#333";
  timerDisplay.style.color = "#fff";
  timerDisplay.style.padding = "8px 12px";
  timerDisplay.style.borderRadius = "4px";
  timerDisplay.style.fontSize = "16px";
  timerDisplay.style.fontWeight = "bold";
  timerDisplay.style.zIndex = "2000";
  timerDisplay.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
  
  document.body.appendChild(timerDisplay);
  state.timerDisplay = timerDisplay;
  
  updateTimerDisplay();
}

// Function to update the timer display
function updateTimerDisplay() {
  if (!state.timerDisplay) return;
  
  const minutes = Math.floor(state.timeRemaining / 60);
  const seconds = state.timeRemaining % 60;
  
  state.timerDisplay.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  
  // Change color when time is running low
  if (state.timeRemaining <= 30) {
    state.timerDisplay.style.backgroundColor = "#d9534f";
  } else {
    state.timerDisplay.style.backgroundColor = "#333";
  }
}

// Function to start the timer
function startProductTimer() {
  // Clear any existing timer
  if (state.timer) {
    clearInterval(state.timer);
  }
  
  // Reset time
  state.timeRemaining = 120;
  
  // Create or update timer display
  createTimerDisplay();
  
  // Start countdown
  state.timer = setInterval(() => {
    state.timeRemaining--;
    updateTimerDisplay();
    
    // When timer reaches zero
    if (state.timeRemaining <= 0) {
      clearInterval(state.timer);
      randomlySellOutProducts();
      
      // Check if any products are still available
      if (areProductsAvailable()) {
        // Restart timer if products are still available
        startProductTimer();
      } else {
        showNotification("All products are sold out at all locations!", "warning");
      }
    }
  }, 1000);
}
// Function to check if any products are still available at any buy location
function areProductsAvailable() {
  let available = false;
  
  buyLocations.forEach(loc => {
    products.forEach(p => {
      if (marketStock[loc][p] > 0) {
        available = true;
      }
    });
  });
  
  return available;
}

// Function to randomly sell out products
function randomlySellOutProducts() {
  let soldOutMsg = "";
  const newSoldOuts = [];
  
  buyLocations.forEach(loc => {
    // For each location, randomly select 1-2 products to sell out
    const numProductsToSellOut = Math.floor(Math.random() * 2) + 1;
    const availableProducts = products.filter(p => marketStock[loc][p] > 0);
    
    if (availableProducts.length > 0) {
      // Shuffle available products
      const shuffled = [...availableProducts].sort(() => 0.5 - Math.random());
      
      // Select products to sell out
      const productsToSellOut = shuffled.slice(0, Math.min(numProductsToSellOut, shuffled.length));
      
      productsToSellOut.forEach(p => {
        marketStock[loc][p] = 0;
        newSoldOuts.push(`${p} at ${loc}`);
      });
    }
  });
  
  if (newSoldOuts.length > 0) {
    showNotification(`⚠️ Products sold out: ${newSoldOuts.join(", ")}`, "warning");
    render(); // Update the UI to reflect the changes
  }
}

// Add CSS for animations
function addNotificationStyles() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    @keyframes fadeOut {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(-20px); }
    }
  `;
  document.head.appendChild(style);
}

function createListing() {
  const product = document.getElementById("listing-product").value;
  const price = parseFloat(document.getElementById("listing-price").value);
  const quantity = parseInt(document.getElementById("listing-quantity").value);
  if (!product || isNaN(price) || isNaN(quantity) || quantity <= 0 || state.inventory[product] < quantity) {
    showNotification("Invalid listing.", "error");
    return;
  }
  state.inventory[product] -= quantity;
  const listing = {
    product,
    price,
    quantity,
    days: 0
  };
  state.onlineListings.push(listing);
  showNotification(`Created listing for ${quantity}x ${product} at $${price}`, "success");
  
  // Reset the form fields
  document.getElementById("listing-price").value = "";
  document.getElementById("listing-quantity").value = "";
  
  render();
  renderOnlineListings();
}

function renderOnlineListings() {
  const tableBody = document.getElementById("online-listings-body");
  if (!tableBody) return;

  tableBody.innerHTML = "";
  state.onlineListings.forEach((listing, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${listing.product}</td>
      <td>${listing.quantity}</td>
      <td>$${listing.price.toFixed(2)}</td>
      <td>${listing.days ?? 0}</td>
      <td><button onclick="confirmReturnListing(${index})">Return</button></td>
    `;
    tableBody.appendChild(tr);
  });
}

function confirmReturnListing(index) {
  const listing = state.onlineListings[index];
  const confirmMsg = `Are you sure you want to return ${listing.quantity}x "${listing.product}" to your inventory?`;

  if (confirm(confirmMsg)) {
    returnListingToInventory(index);
  }
}

function returnListingToInventory(index) {
  const listing = state.onlineListings[index];
  state.inventory[listing.product] = (state.inventory[listing.product] || 0) + listing.quantity;
  state.onlineListings.splice(index, 1);
  showNotification(`Returned ${listing.quantity}x ${listing.product} to inventory`, "info");
  render();
  renderOnlineListings();
}

function render() {
  document.getElementById("day").textContent = state.day;
  document.getElementById("location").textContent = state.location;
  document.getElementById("market-location").textContent = state.location;
  document.getElementById("money").textContent = state.money.toFixed(2);
  document.getElementById("rumor").textContent = state.rumor;

  const inventoryList = document.getElementById("inventory-list");
  inventoryList.innerHTML = "";
  products.forEach(p => {
    const li = document.createElement("li");
    const inventoryQty = state.inventory[p];

    const pendingGroups = {};
    state.deliveryQueue
      .filter(item => item.product === p)
      .forEach(item => {
        const daysLeft = item.arrivalDay - state.day;
        if (!pendingGroups[daysLeft]) {
          pendingGroups[daysLeft] = 0;
        }
        pendingGroups[daysLeft] += item.quantity;
      });

    let pendingText = '';
    const days = Object.keys(pendingGroups).map(Number).sort((a, b) => a - b);
    if (days.length > 0) {
      const groups = days.map(d => `${pendingGroups[d]} in ${d} day${d !== 1 ? 's' : ''}`);
      pendingText = ` <span style="font-style: italic;">(${groups.join(', ')})</span>`;
    }

    li.innerHTML = `${p}: ${inventoryQty}${pendingText}`;
    inventoryList.appendChild(li);
  });

  const table = document.getElementById("market-table");
  table.innerHTML = "";
  products.forEach(product => {
    const price = marketPrices[state.location][product];
    const stock = marketStock[state.location][product];
    const playerHas = state.inventory[product] > 0;
    const outOfStock = stock <= 0;
    
    const row = document.createElement("tr");
    row.id = `product-row-${product.replace(/\s+/g, '-')}`;
    
    // Product name and price cell
    const nameCell = document.createElement("td");
    nameCell.textContent = product;
    row.appendChild(nameCell);
    
    // Price and stock cell
    const priceCell = document.createElement("td");
    priceCell.textContent = `$${price}${buyLocations.includes(state.location) ? ` (${stock} left)` : ''}`;
    row.appendChild(priceCell);
    
    // Buy button cell
    const buyCell = document.createElement("td");
    if (buyLocations.includes(state.location)) {
      const buyButton = document.createElement("button");
      buyButton.textContent = "Buy";
      buyButton.onclick = () => buy(product);
      
      if (outOfStock) {
        buyButton.disabled = true;
        buyButton.style.opacity = "0.4";
      }
      
      buyCell.appendChild(buyButton);
    }
    row.appendChild(buyCell);
    
    // Sell button cell
    const sellCell = document.createElement("td");
    if (sellLocations.includes(state.location)) {
      const sellButton = document.createElement("button");
      sellButton.textContent = "Sell";
      sellButton.onclick = () => sell(product);
      
      if (!playerHas) {
        sellButton.disabled = true;
        sellButton.style.opacity = "0.4";
      }
      
      sellCell.appendChild(sellButton);
    }
    row.appendChild(sellCell);
    
    // Success indicator cell (for checkmark)
    const successCell = document.createElement("td");
    successCell.id = `success-${product.replace(/\s+/g, '-')}`;
    successCell.style.width = "20px";
    row.appendChild(successCell);
    
    table.appendChild(row);
  });
  
  const listingSelect = document.getElementById("listing-product");
  if (listingSelect) {
    listingSelect.innerHTML = "";
    products.forEach(p => {
      const option = document.createElement("option");
      option.value = p;
      option.textContent = p;
      listingSelect.appendChild(option);
    });
  }

  const listingTable = document.getElementById("listing-table");
  if (listingTable) {
    listingTable.innerHTML = "<tr><th>Product</th><th>Price</th><th>Quantity</th></tr>";
    state.onlineListings.forEach(listing => {
      const row = document.createElement("tr");
      row.innerHTML = `<td>${listing.product}</td><td>$${listing.price}</td><td>${listing.quantity}</td>`;
      listingTable.appendChild(row);
    });
  }
  
  if (state.soldOutProducts.length > 0) {
    showNotification("Sold out products today: " + state.soldOutProducts.join(", "), "warning");
    state.soldOutProducts = [];
  }
}

function showSuccessCheckmark(product) {
  const successCell = document.getElementById(`success-${product.replace(/\s+/g, '-')}`);
  if (successCell) {
    // Add green checkmark
    successCell.innerHTML = "✅";
    
    // Remove after 2 seconds
    setTimeout(() => {
      successCell.innerHTML = "";
    }, 2000);
  }
}

function buy(product) {
  const price = marketPrices[state.location][product];
  const stock = marketStock[state.location][product];
  if (stock > 0 && state.money >= price) {
    state.money -= price;
    marketStock[state.location][product]--;

    // Track the purchase
    gameStats.totalBought++;
    
    if (state.location === "eCommerce Store") {
      state.deliveryQueue.push({ product, quantity: 1, arrivalDay: state.day + 3 });
      showNotification(`Bought ${product} for $${price}. Will be delivered in 3 days.`, "success");
    } else {
      state.inventory[product]++;
      showNotification(`Bought ${product} for $${price}`, "success");
    }

    if (buyLocations.includes(state.location)) {
      state.priceHistory[product].push(price);
      if (state.priceHistory[product].length > 90) {
        state.priceHistory[product].shift();
      }
    }

    // Show green checkmark
    showSuccessCheckmark(product);
    
    render();
  } else {
    showNotification("Not enough money or product is out of stock!", "error");
  }
}

function sell(product) {
  const price = marketPrices[state.location][product];
  if (state.inventory[product] > 0) {
    state.money += price;
    state.inventory[product]--;
        
    // Track the sale
    gameStats.totalSold++;
    
    showNotification(`Sold ${product} for $${price}`, "success");
    
    // Show green checkmark
    showSuccessCheckmark(product);
    
    render();
  } else {
    showNotification("You don't have any to sell!", "error");
  }
}

function travel(newLocation) {
  const oldLocation = state.location;  
  state.location = newLocation;
  showNotification(`Traveled to ${newLocation}`, "info");
  render();
}

// Initialize the rumor system tracking variables
function initializeRumorSystem() {
  state.rumorPool = {
    lowStock: {
      count: 3,
      products: [...products].sort(() => Math.random() - 0.5).slice(0, 3),
      used: false
    },
    noReprint: {
      count: 3,
      products: [...products].sort(() => Math.random() - 0.5).slice(0, 3),
      used: false
    },
    overprint: {
      count: 3,
      products: [...products].sort(() => Math.random() - 0.5).slice(0, 3),
      used: false
    }
  };
  
  state.rumorSchedule = [];
  state.pendingRumorEffects = [];
  
  // Create a randomized schedule that places rumors at specific days
  // Reserve some early days for lowStock, mid-game for overprint, late game for noReprint
  
  // Low stock rumors in early to mid game (days 2-15)
  state.rumorPool.lowStock.products.forEach(product => {
    let day = Math.floor(Math.random() * 14) + 2; // Days 2-15
    while (state.rumorSchedule.some(r => r.day === day)) {
      day = Math.floor(Math.random() * 14) + 2;
    }
    state.rumorSchedule.push({ day, type: 'lowStock', product });
  });
  
  // Overprint rumors in mid game (days 10-20)
  state.rumorPool.overprint.products.forEach(product => {
    let day = Math.floor(Math.random() * 11) + 10; // Days 10-20
    while (state.rumorSchedule.some(r => r.day === day)) {
      day = Math.floor(Math.random() * 11) + 10;
    }
    state.rumorSchedule.push({ day, type: 'overprint', product });
  });
  
  // No reprint rumors in late game (days 15-25)
  state.rumorPool.noReprint.products.forEach(product => {
    let day = Math.floor(Math.random() * 11) + 15; // Days 15-25
    while (state.rumorSchedule.some(r => r.day === day)) {
      day = Math.floor(Math.random() * 11) + 15;
    }
    state.rumorSchedule.push({ day, type: 'noReprint', product });
  });
}

// Generate a rumor for the day
function generateRumor() {
  // Check if there's a scheduled rumor for today
  const scheduledRumor = state.rumorSchedule.find(r => r.day === state.day);
  
  if (scheduledRumor) {
    const { type, product } = scheduledRumor;
    
    switch (type) {
      case "lowStock":
        state.rumor = `${product} could be low in stock at distributors...`;
        // Add to pending effects instead of setting immediately
        state.pendingRumorEffects.push({ 
          type: "lowStock", 
          product, 
          applyDay: state.day + 1 
        });
        break;
      case "noReprint":
        state.rumor = `Rumor is the TCG Company is not printing anymore ${product}...`;
        // Add to pending effects instead of setting immediately
        state.pendingRumorEffects.push({ 
          type: "noReprint", 
          product, 
          applyDay: state.day + 1 
        });
        break;
      case "overprint":
        state.rumor = `I heard that a ton of ${product} is being reprinted...`;
        // Add to pending effects instead of setting immediately
        state.pendingRumorEffects.push({ 
          type: "overprint", 
          product, 
          applyDay: state.day + 1 
        });
        break;
    }
    
    console.log(`Day ${state.day}: Generated rumor of type ${type} for ${product}`);
  } else {
    state.rumor = "No news today...";
  }
}

// Apply rumor effects to the market
function applyRumorEffectsToMarket() {
  // Process any pending rumor effects that should be applied today
  const pendingEffects = state.pendingRumorEffects.filter(effect => effect.applyDay === state.day);
  
  pendingEffects.forEach(effect => {
    const { type, product } = effect;
    
    switch (type) {
      case "lowStock":
        if (!state.rumorPool.lowStock.used) {
          // Set stock to lower levels for the product
          buyLocations.forEach(loc => {
            marketStock[loc][product] = Math.max(0, marketStock[loc][product] - 5);
          });
          state.rumorPool.lowStock.used = true;
          console.log(`Day ${state.day}: Applied lowStock rumor effect for ${product}`);
          showNotification(`The rumors about ${product} being low in stock appear to be true! Stock levels have dropped.`, "warning");
        }
        break;
        
      case "noReprint":
        if (!state.rumorPool.noReprint.used) {
          // Make the product rarer and inflate its price
          buyLocations.forEach(loc => {
            marketPrices[loc][product] = Math.floor(marketPrices[loc][product] * 4);
            marketStock[loc][product] = Math.floor(marketStock[loc][product] * 0.3);
          });
          state.rumorPool.noReprint.used = true;
          console.log(`Day ${state.day}: Applied noReprint rumor effect for ${product}`);
          showNotification(`It's confirmed! ${product} will not be reprinted. Prices have spiked dramatically!`, "warning");
        }
        break;
        
      case "overprint":
        if (!state.rumorPool.overprint.used) {
          // Increase stock and reduce price
          buyLocations.forEach(loc => {
            marketStock[loc][product] = Math.floor(marketStock[loc][product] * 4);
            marketPrices[loc][product] = Math.floor(marketPrices[loc][product] * 0.6);
          });
          state.rumorPool.overprint.used = true;
          console.log(`Day ${state.day}: Applied overprint rumor effect for ${product}`);
          showNotification(`A massive reprint of ${product} has arrived! Prices have dropped and stock is plentiful.`, "info");
        }
        break;
    }
  });
  
  // Remove the effects we just processed
  state.pendingRumorEffects = state.pendingRumorEffects.filter(effect => effect.applyDay !== state.day);
}

// Function to show a modal notification that requires acknowledgment
function showModalNotification(message, title = "Notification") {
  // Create modal container if it doesn't exist
  let modalContainer = document.getElementById("modal-container");
  if (!modalContainer) {
    modalContainer = document.createElement("div");
    modalContainer.id = "modal-container";
    modalContainer.style.position = "fixed";
    modalContainer.style.top = "0";
    modalContainer.style.left = "0";
    modalContainer.style.width = "100%";
    modalContainer.style.height = "100%";
    modalContainer.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    modalContainer.style.display = "flex";
    modalContainer.style.justifyContent = "center";
    modalContainer.style.alignItems = "center";
    modalContainer.style.zIndex = "2000";
    document.body.appendChild(modalContainer);
  }
  
  // Create modal content
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.style.backgroundColor = "#fff";
  modal.style.padding = "20px";
  modal.style.borderRadius = "5px";
  modal.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.2)";
  modal.style.maxWidth = "80%";
  modal.style.maxHeight = "80%";
  modal.style.overflow = "auto";
  
  // Add title
  const modalTitle = document.createElement("h3");
  modalTitle.textContent = title;
  modalTitle.style.marginTop = "0";
  modalTitle.style.borderBottom = "1px solid #eee";
  modalTitle.style.paddingBottom = "10px";
  modal.appendChild(modalTitle);
  
  // Add content
  const modalContent = document.createElement("div");
  modalContent.innerHTML = message;
  modalContent.style.marginBottom = "15px";
  modalContent.style.maxHeight = "60vh";
  modalContent.style.overflow = "auto";
  modal.appendChild(modalContent);
  
  // Add acknowledge button
  const acknowledgeButton = document.createElement("button");
  acknowledgeButton.textContent = "OK";
  acknowledgeButton.style.padding = "8px 16px";
  acknowledgeButton.style.backgroundColor = "#4CAF50";
  acknowledgeButton.style.color = "white";
  acknowledgeButton.style.border = "none";
  acknowledgeButton.style.borderRadius = "4px";
  acknowledgeButton.style.cursor = "pointer";
  acknowledgeButton.style.float = "right";
  
  acknowledgeButton.onclick = function() {
    modalContainer.style.display = "none";
    modal.remove();
  };
  
  modal.appendChild(acknowledgeButton);
  
  // Show the modal
  modalContainer.style.display = "flex";
  modalContainer.innerHTML = "";
  modalContainer.appendChild(modal);
}

// Update the stock message to include prices
function generateStockUpdateMessage() {
  let stockMsg = "<h4>Buy Location Stock Update</h4>";
  buyLocations.forEach(loc => {
    stockMsg += `<p><strong>${loc}:</strong></p><ul style="margin-top: 5px;">`;
    products.forEach(p => {
      stockMsg += `<li>${p}: ${marketStock[loc][p]} units @ $${marketPrices[loc][p]}</li>`;
    });
    stockMsg += "</ul>";
  });
  return stockMsg;
}

// Update the initial welcome message to include prices
function generateWelcomeMessage() {
  let stockMsg = "<h4>Welcome to the game!</h4><p>Here is the initial stock:</p>";
  buyLocations.forEach(loc => {
    stockMsg += `<p><strong>${loc}:</strong></p><ul style="margin-top: 5px;">`;
    products.forEach(p => {
      stockMsg += `<li>${p}: ${marketStock[loc][p]} units @ $${marketPrices[loc][p]}</li>`;
    });
    stockMsg += "</ul>";
  });
  return stockMsg;
}

function nextDay() {
  if (state.day >= 30 || state.money <= 0) {
    showGameOverModal();
    return;
  }
  
  // Get the selected location before moving to the next day
  const locationSelect = document.getElementById("location-select");
  if (locationSelect) {
    const newLocation = locationSelect.value;
    if (newLocation !== state.location) {
      travel(newLocation);
    }
  }
  
  // Stop the current timer
  if (state.timer) {
    clearInterval(state.timer);
  }
  
  state.day++;

  // Start a new timer
  startProductTimer();

// Process pending deliveries
  const arrivedDeliveries = [];
  state.deliveryQueue = state.deliveryQueue.filter(entry => {
    if (entry.arrivalDay <= state.day) {
      state.inventory[entry.product] += entry.quantity;
      arrivedDeliveries.push(`${entry.quantity}x ${entry.product}`);
      return false;
    }
    return true;
  });
  
  if (arrivedDeliveries.length > 0) {
    showNotification(`Deliveries arrived: ${arrivedDeliveries.join(", ")}`, "success");
  }
  
  // Update the Online Listings Auto-Sell to track sales
  const soldListings = [];
  for (let i = state.onlineListings.length - 1; i >= 0; i--) {
    const listing = state.onlineListings[i];
    listing.days = (listing.days || 0) + 1;
    const history = state.priceHistory[listing.product].slice(-3);
    const avgPrice = history.length > 0 ? history.reduce((a, b) => a + b, 0) / history.length : listing.price;
    if (listing.price <= avgPrice * 3 && Math.random() < 0.25) {
      state.money += listing.price * listing.quantity;
      
      // Track the sales from listings
      gameStats.totalSold += listing.quantity;
      
      soldListings.push(listing);
      state.onlineListings.splice(i, 1);
    } else if (listing.days >= 5) {
      showNotification(`Your listing for ${listing.product} has not sold after 5 days. Consider withdrawing it.`, "warning");
    }
  }

  // The rest of your existing nextDay function code...
  // [Retaining all existing code below this point]
  
  // Reduce quantity at old location (0-5 units per product)
  if (buyLocations.includes(state.location)) {
    products.forEach(p => {
      marketStock[state.location][p] = Math.max(0, marketStock[state.location][p] - Math.floor(Math.random() * 6));
    });
  }
  
  // Refresh prices and quantities
  buyLocations.concat(sellLocations).forEach(loc => {
    products.forEach(p => {
      let priceRange;
      if (["The Base Set", "The Nostalgia Set"].includes(p)) {
        priceRange = state.day <= 15 ? [400, 800] : [600, 1200];
      } else if (["Dark Flames", "Masks of Dawn"].includes(p)) {
        priceRange = state.day <= 15 ? [80, 250] : [150, 300];
      } else {
        priceRange = state.day <= 15 ? [120, 300] : [200, 500];
      }
      let basePrice = Math.floor(Math.random() * (priceRange[1] - priceRange[0] + 1)) + priceRange[0];
      // Adjust price based on location behavior
      if (loc === "Local Game Store") {
        basePrice = Math.round(basePrice * ((Math.random() * 0.1) + 0.95)); // small fluctuation
      } else if (loc === "Cost-Mart") {
        basePrice = Math.round(basePrice * ((Math.random() * 0.15) + 0.85)); // lower, stable
      } else if (loc === "eCommerce Store") {
        basePrice = Math.round(basePrice * ((Math.random() * 0.5) + 0.75)); // volatile
      }
      marketPrices[loc][p] = Math.max(10, basePrice);
      // Adjust stock based on location
      if (loc === "Local Game Store") {
        marketStock[loc][p] = Math.floor(Math.random() * 6) + 10; // more consistent
      } else if (loc === "Cost-Mart") {
        marketStock[loc][p] = Math.floor(Math.random() * 4) + 1;  // low stock
      } else if (loc === "eCommerce Store") {
        marketStock[loc][p] = Math.floor(Math.random() * 15);     // volatile
      }
      if (buyLocations.includes(loc)) {
        state.priceHistory[p].push(marketPrices[loc][p]);
        if (state.priceHistory[p].length > 90) {
          state.priceHistory[p].shift();
        }
      }
    });
  });
  
  // Enforce $1 gap between buy/sell
  products.forEach(p => {
    const minSell = Math.min(...sellLocations.map(loc => marketPrices[loc][p]));
    buyLocations.forEach(loc => {
      if (marketPrices[loc][p] >= minSell) {
        marketPrices[loc][p] = Math.max(10, minSell - 1);
      }
    });
  });
  
  // Generate rumor and apply effects
  generateRumor();
  applyRumorEffectsToMarket();
  
  // === Buy location stock notification with prices ===
  showModalNotification(generateStockUpdateMessage(), "Stock and Pricing info");
  
  // === Notify if anything is sold out ===
  // Track previously sold out products
  if (!state.previouslySoldOut) {
    state.previouslySoldOut = {};
    products.forEach(p => {
      state.previouslySoldOut[p] = new Set();
    });
  }
  
  let soldOutMsg = "";
  let newSoldOuts = 0;
  products.forEach(p => {
    buyLocations.forEach(loc => {
      if (marketStock[loc][p] === 0 && !state.previouslySoldOut[p].has(loc)) {
        soldOutMsg += `⚠️ ${p} is sold out at ${loc}!<br>`;
        state.previouslySoldOut[p].add(loc);
        newSoldOuts++;
      }
    });
  });
  
  // Only show notification if there are NEW soldouts
  if (newSoldOuts > 0) showNotification(soldOutMsg.trim(), "warning");
  
  // Update rumor display and re-render
  document.getElementById("rumor").textContent = state.rumor;
  showNotification(`Day ${state.day}: ${state.rumor}`, "info");
  render();
  renderOnlineListings();
  
  // Check for game over after all day operations
  if (state.day >= 30 || state.money <= 0) {
    setTimeout(() => {
      showGameOverModal();
    }, 500);
  }
}

// Display the game over modal with leaderboard form
function showGameOverModal() {
  // Stop the timer if it's running
  if (state.timer) {
    clearInterval(state.timer);
  }
  
  // Update the final stats
  document.getElementById("final-money").textContent = state.money.toFixed(2);
  document.getElementById("final-days").textContent = state.day;
  document.getElementById("final-bought").textContent = gameStats.totalBought;
  document.getElementById("final-sold").textContent = gameStats.totalSold;
  
  // Show the leaderboard modal
  document.getElementById("leaderboard-modal").style.display = "flex";
  
  // Focus on the initials input
  setTimeout(() => {
    document.getElementById("player-initials").focus();
  }, 300);
  
  // Add event listeners for form submission
  document.getElementById("submit-score").addEventListener("click", submitScore);
  document.getElementById("play-again").addEventListener("click", playAgain);
}

// Submit the score to Firebase
function submitScore() {
  const initials = document.getElementById("player-initials").value.trim();
  
  if (!initials) {
    showNotification("Please enter your initials!", "error");
    return;
  }
  
  const scoreData = {
    initials: initials,
    money: state.money,
    days: state.day,
    bought: gameStats.totalBought,
    sold: gameStats.totalSold,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };
  
  // Push to Firebase
  database.ref('leaderboard').push(scoreData)
    .then(() => {
      showNotification("Score submitted successfully!", "success");
      document.getElementById("leaderboard-form").style.display = "none";
      displayLeaderboard();
    })
    .catch(error => {
      console.error("Error submitting score:", error);
      showNotification("Error submitting score. Please try again.", "error");
    });
}

// Display the leaderboard from Firebase
function displayLeaderboard() {
  const leaderboardBody = document.getElementById("leaderboard-body");
  leaderboardBody.innerHTML = '<tr><td colspan="6">Loading leaderboard...</td></tr>';
  
  document.getElementById("leaderboard-display").style.display = "block";
  
  // Fetch top 10 scores sorted by money
  database.ref('leaderboard')
    .orderByChild('money')
    .limitToLast(10)
    .once('value')
    .then(snapshot => {
      const scores = [];
      snapshot.forEach(childSnapshot => {
        scores.push(childSnapshot.val());
      });
      
      // Sort by money (highest first)
      scores.sort((a, b) => b.money - a.money);
      
      // Update the leaderboard table
      leaderboardBody.innerHTML = '';
      scores.forEach((score, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${index + 1}</td>
          <td>${score.initials}</td>
          <td>$${score.money.toFixed(2)}</td>
          <td>${score.days}</td>
          <td>${score.bought}</td>
          <td>${score.sold}</td>
        `;
        leaderboardBody.appendChild(row);
      });
    })
    .catch(error => {
      console.error("Error fetching leaderboard:", error);
      leaderboardBody.innerHTML = '<tr><td colspan="6">Error loading leaderboard</td></tr>';
    });
}

// Restart the game
function playAgain() {
  document.getElementById("leaderboard-modal").style.display = "none";
  initializeGame();
}


// Initialize the game on day 1 
function initializeGame() {
  console.log("Game is initializing..."); // debug line
  
  // Add notification styles
  addNotificationStyles();
  addModalStyles();
  
  // Reset game stats
  gameStats = {
    totalBought: 0,
    totalSold: 0
  };  
  
  // Create notification container
  const notifContainer = document.createElement("div");
  notifContainer.id = "notification-container";
  notifContainer.style.position = "fixed";
  notifContainer.style.top = "10px";
  notifContainer.style.right = "10px";
  notifContainer.style.width = "300px";
  notifContainer.style.zIndex = "1000";
  document.body.appendChild(notifContainer);
  
  // Reset game state
  state.day = 1;
  state.location = "Local Game Store";
  state.money = 1000;
  state.inventory = {};
  state.rumor = "None yet...";
  state.deliveryQueue = [];
  state.onlineListings = [];
  state.priceHistory = {};
  state.soldOutProducts = [];
  state.rumorsLowStock = null;
  state.rumorsNoReprint = null;
  state.rumorsOverprint = null;
  state.notifications = [];
  
  products.forEach(p => {
    state.inventory[p] = 0;
    state.priceHistory[p] = [];
  });
  
  // Initialize market prices and stock
  buyLocations.concat(sellLocations).forEach(loc => {
    marketPrices[loc] = {};
    marketStock[loc] = {};
    products.forEach(p => {
      const price = generatePrice(p);
      marketPrices[loc][p] = price;
      marketStock[loc][p] = generateStock(loc);
      if (buyLocations.includes(loc)) {
        state.priceHistory[p].push(price);
      }
    });
  });
  
  // Initialize the rumor system
  initializeRumorSystem();
  
  render();
  
  // Initial Stock info as notification
  let stockMsg = "Welcome Scalper! Here is the initial stock:<br>";
  buyLocations.forEach(loc => {
    stockMsg += `<br><strong>${loc}:</strong><br>`;
    products.forEach(p => {
      stockMsg += `&nbsp;&nbsp;${p}: ${marketStock[loc][p]} units @ $${marketPrices[loc][p]}<br>`;
    });
  });
  showModalNotification(stockMsg,"");
  
  // Start the timer
  startProductTimer();
}

window.onload = async () => {
  // First visit (or ?intro=1): arcade cut scene -> title -> optional tutorial.
  // The 2-minute sellout timer only starts once the player is actually in the game.
  if (window.Intro) {
    if (Intro.shouldPlay()) {
      try {
        await Intro.run(render);
      } catch (e) {
        console.error("Intro failed, starting game anyway:", e);
      }
    }
    Intro.addReplayButton();
  }
  initializeGame();
};
