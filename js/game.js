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

// Market + rumors live in js/market.js. ?seed=abc123 replays an exact market.
function seedFromUrl() {
  try { return new URLSearchParams(location.search).get("seed"); } catch (e) { return null; }
}
let market = TCGMarket.create(seedFromUrl());
const products = market.products;
const buyLocations = market.buyLocations;
const sellLocations = market.sellLocations;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

// Mirror the engine into the simple lookup tables the UI already uses.
function syncMarket() {
  buyLocations.concat(sellLocations).forEach(loc => {
    marketPrices[loc] = marketPrices[loc] || {};
    marketStock[loc] = marketStock[loc] || {};
    products.forEach(p => {
      marketPrices[loc][p] = market.price(loc, p);   // null = closed today
      marketStock[loc][p] = market.stock(loc, p);
    });
  });
}
syncMarket();

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
      top: 0;
      left: 0;
      width: 100%;
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
      width: 92%;
      max-width: 560px;
      max-height: 92vh;
      overflow: auto;
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
        market.sellOut(loc, p);
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
  document.getElementById("day").textContent = `${state.day} (${WEEKDAYS[state.day % 7]})`;
  document.getElementById("location").textContent = state.location;
  document.getElementById("market-location").textContent = state.location;
  document.getElementById("money").textContent = state.money.toFixed(2);
  if (state.runOver) document.querySelectorAll(".container button, .locations button, .market-locations button, .online-store button, .next-day button").forEach(b => (b.disabled = true));
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

    li.innerHTML = `${p}: ${inventoryQty}${pendingText}${ripButtonHtml(p)}`;
    inventoryList.appendChild(li);
  });

  const table = document.getElementById("market-table");
  table.innerHTML = "";
  products.forEach(product => {
    const price = marketPrices[state.location][product];
    const stock = marketStock[state.location][product];
    const closed = price == null;
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
    priceCell.textContent = closed ? "CLOSED TODAY"
      : `$${price}${buyLocations.includes(state.location) ? ` (${stock} left)` : ''}`;
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
      
      if (!playerHas || closed) {
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
  const mRow = mysteryRow();
  if (mRow) table.appendChild(mRow);
  
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
  renderProgress();
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
  if (state.runOver) return;
  const price = market.price(state.location, product);
  const stock = market.stock(state.location, product);
  if (price != null && stock > 0 && state.money >= price) {
    const result = market.buy(state.location, product);
    if (!result.ok) return;
    state.money -= price;
    syncMarket();
    trackBuy(product, price);

    // Track the purchase
    gameStats.totalBought++;
    
    if (result.arrivesDay > state.day) {
      state.deliveryQueue.push({ product, quantity: 1, arrivalDay: result.arrivesDay });
      showNotification(`Bought ${product} for $${price}. Arrives in ${result.arrivesDay - state.day} days.`, "success");
    } else {
      state.inventory[product]++;
      showNotification(`Bought ${product} for $${price}`, "success");
    }

    // Show green checkmark
    showSuccessCheckmark(product);
    
    render();
  } else if (price == null) {
    showNotification(`${state.location} is closed today.`, "error");
  } else {
    showNotification("Not enough money or product is out of stock!", "error");
  }
}

function sell(product) {
  if (state.runOver) return;
  if (!market.isOpen(state.location)) {
    showNotification(`${state.location} is closed today.`, "error");
    return;
  }
  if (state.inventory[product] > 0) {
    const { price } = market.sell(state.location, product);
    syncMarket();
    state.money += price;
    trackSell(product, price);
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
  showNotification(market.isOpen(newLocation)
    ? `Traveled to ${newLocation}`
    : `${newLocation} is closed today. The Convention runs Sat & Sun.`, market.isOpen(newLocation) ? "info" : "warning");
  render();
}

// Function to show a modal notification that requires acknowledgment
// Modals queue up so a rent notice never hides a shop/grail moment.
const modalQueue = [];
let modalOpen = false;
function showModalNotification(message, title = "Notification", onClose) {
  if (modalOpen) { modalQueue.push([message, title, onClose]); return; }
  modalOpen = true;
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
  modal.className = "notice-modal";
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
  acknowledgeButton.style.display = "block";
  acknowledgeButton.style.marginLeft = "auto";
  
  acknowledgeButton.onclick = function() {
    modalContainer.style.display = "none";
    modal.remove();
    modalOpen = false;
    if (typeof onClose === "function") onClose();
    if (modalQueue.length) showModalNotification(...modalQueue.shift());
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
  if (state.runOver) return;
  // Record where the day you're leaving ended up (for the share strip)
  state.netWorthHistory.push(Math.round(netWorth()));
  // Main game over without a shop? End after Day 30.
  if (!state.shopOpen && state.day >= TCGRules.RULES.mainDays) { state.day++; checkRunEnd(); return; }
  
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
  market.nextDay();
  syncMarket();

  // Rent / shop income / loan interest
  economyTick().forEach(msg => showNotification(msg, msg.startsWith("🏠") && msg.includes("short") ? "error" : "info"));
  if (checkRunEnd()) return;

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
  
  // Online listings: each listed box has a daily chance to sell. The closer
  // the ask is to true market value, the better the odds. 13% platform fee.
  const listingSales = [];
  for (let i = state.onlineListings.length - 1; i >= 0; i--) {
    const listing = state.onlineListings[i];
    listing.days = (listing.days || 0) + 1;
    const r = market.listingSales(listing.product, listing.price, listing.quantity);
    if (r.sold > 0) {
      const payout = r.sold * r.payoutEach;
      state.money += payout;
      gameStats.totalSold += r.sold;
      listing.quantity -= r.sold;
      listingSales.push(`${r.sold}x ${listing.product} (+$${payout.toFixed(2)})`);
      if (listing.quantity <= 0) state.onlineListings.splice(i, 1);
    } else if (listing.days >= 5) {
      showNotification(`Your ${listing.product} listing hasn't moved in ${listing.days} days. Price might be too high.`, "warning");
    }
  }
  if (listingSales.length > 0) {
    showNotification(`Online sales after fees: ${listingSales.join(", ")}`, "success");
  }

  // Today's news: rumors (some fake), confirmations and follow-ups
  const news = market.headlines();
  state.rumor = news.length ? news.join("\n") : "No news today...";
  
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
  if (news.length) showNotification(`Day ${state.day}: ${news.join("<br>")}`, "info");
  render();
  renderOnlineListings();
  
}

// Submit the score to Firebase
function submitScore() {
  const initials = document.getElementById("player-initials").value.trim();
  
  if (!initials) {
    showNotification("Please enter your initials!", "error");
    return;
  }
  
  const scoreData = {
    initials: initials.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase(),
    money: Math.round(netWorth()),
    days: state.day,
    shopDay: state.shopDay || null,
    grailBox: state.grailBox || null,
    board: state.runLabel,
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
        // textContent only: never render leaderboard data as HTML
        const row = document.createElement('tr');
        [index + 1, String(score.initials || "").slice(0, 3),
         "$" + Math.round(Number(score.money) || 0).toLocaleString(),
         score.shopDay ? "Day " + Number(score.shopDay) : "—",
         score.grailBox ? "#" + Number(score.grailBox) : "—",
         Number(score.days) || 0].forEach(v => {
          const td = document.createElement('td');
          td.textContent = v;
          row.appendChild(td);
        });
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
  playFree = true; // the Daily Market is one shot; replays are free play
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
  
  // Create notification container (once)
  if (!document.getElementById("notification-container")) {
  const notifContainer = document.createElement("div");
  notifContainer.id = "notification-container";
  notifContainer.style.position = "fixed";
  notifContainer.style.top = "10px";
  notifContainer.style.right = "10px";
  notifContainer.style.width = "300px";
  notifContainer.style.zIndex = "1000";
  document.body.appendChild(notifContainer);
  }
  
  // Reset game state
  state.day = 1;
  state.location = "Local Game Store";
  state.money = TCGRules.RULES.startCash;
  resetProgress();
  state.inventory = {};
  state.rumor = "None yet...";
  state.deliveryQueue = [];
  state.onlineListings = [];
  state.priceHistory = {};
  state.soldOutProducts = [];
  state.notifications = [];
  
  products.forEach(p => {
    state.inventory[p] = 0;
    state.priceHistory[p] = [];
  });
  
  // Fresh market: today's Daily Market, a friend's ?seed=, or free play
  const run = seedForRun();
  market = TCGMarket.create(run.seed, {
    mysteryChance: TCGRules.RULES.mysteryChancePerDay,
    mysteryPrice: TCGRules.RULES.mysteryPrice
  });
  state.seed = market.seed;
  state.runLabel = run.label;
  syncMarket();
  const news = market.headlines();
  state.rumor = news.length ? news.join("\n") : "No news yet...";
  
  render();
  
  // Initial Stock info as notification
  let stockMsg = `<strong>${state.runLabel}</strong><br>Rent is due every 7 days. Raise $${TCGRules.RULES.lease.toLocaleString()} to open your own shop before Day ${TCGRules.RULES.mainDays}.<br><br>Here is today's stock:<br>`;
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
