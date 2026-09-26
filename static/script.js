// Variables para sa running average
let sumTemp = 0, sumHum = 0, sumSoil = 0, sumLight = 0;
let readCount = 0;



function updateDateTime() {
    const dateElement = document.getElementById("currentDate");
    const now = new Date();
    const options = { weekday: "long", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };
    if (dateElement) dateElement.textContent = now.toLocaleDateString("en-US", options);
}
updateDateTime();
setInterval(updateDateTime, 60000);

function updateAutomationUI(data) {
    // --- Pump ---
    const pumpCard = document.getElementById("autoWateringCard");
    if (data.pump) {
        pumpCard.classList.add("active-pump");
        document.getElementById("pumpTitle").textContent = "Auto-Watering: ACTIVE";
        document.getElementById("pumpDesc").textContent = "Soil is dry (<=40%). Pumping water.";
    } else {
        pumpCard.classList.remove("active-pump");
        document.getElementById("pumpTitle").textContent = "Auto-Watering: Standby";
        document.getElementById("pumpDesc").textContent = "Soil moisture is optimal.";
    }

    // --- Light ---
    const lightCard = document.getElementById("autoLightCard");
    if (data.lightState) {
        lightCard.classList.add("active-light");
        document.getElementById("lightTitle").textContent = "Grow Light: ACTIVE";
        document.getElementById("lightDesc").textContent = "Low light detected. Supplementing.";
    } else {
        lightCard.classList.remove("active-light");
        document.getElementById("lightTitle").textContent = "Grow Light: Standby";
        document.getElementById("lightDesc").textContent = "Natural light is sufficient.";
    }

    // --- Fan ---
    const fanCard = document.getElementById("autoFanCard");
    if (data.fan) {
        fanCard.classList.add("active-fan");
        document.getElementById("fanTitle").textContent = "Exhaust Fan: ACTIVE";
        document.getElementById("fanDesc").textContent = "High temp (>=30°C). Cooling down.";
    } else {
        fanCard.classList.remove("active-fan");
        document.getElementById("fanTitle").textContent = "Exhaust Fan: Standby";
        document.getElementById("fanDesc").textContent = "Temperature is optimal.";
    }
}


function updateSensorUI(data) {
    const tempEl = document.getElementById("temperature");
    const tempStatus = document.getElementById("temperatureStatus");
    const humEl = document.getElementById("humidity");
    const humStatus = document.getElementById("humidityStatus");

    if (tempEl && humEl) {
        if (!data.dhtConnected) {
            tempEl.textContent = "--";
            tempStatus.textContent = "DISCONNECTED";
            tempStatus.style.color = "var(--danger)";
            humEl.textContent = "--";
            humStatus.textContent = "DISCONNECTED";
            humStatus.style.color = "var(--danger)";
        } else {
            tempEl.textContent = Number(data.temp).toFixed(1);
            tempStatus.textContent = data.temp >= 30 ? "WARNING" : "NORMAL";
            tempStatus.style.color = data.temp >= 30 ? "var(--danger)" : "var(--primary)";
            humEl.textContent = Math.round(data.hum);
            humStatus.textContent = data.hum >= 60 && data.hum <= 80 ? "NORMAL" : "WARNING";
            humStatus.style.color = data.hum >= 60 && data.hum <= 80 ? "var(--primary)" : "var(--warning)";
        }
    }

    const soilEl = document.getElementById("soil");
    const soilStatus = document.getElementById("soilStatus");
    if (soilEl) {
        if (!data.soilConnected) {
            soilEl.textContent = "--";
            soilStatus.textContent = "DISCONNECTED";
            soilStatus.style.color = "var(--danger)";
        } else {
            soilEl.textContent = Math.round(data.soil);
            soilStatus.textContent = data.soil <= 40 ? "LOW" : "GOOD";
            soilStatus.style.color = data.soil <= 40 ? "var(--danger)" : "var(--primary)";
        }
    }

    const lightEl = document.getElementById("light");
    const lightStatus = document.getElementById("lightStatus");
    if (lightEl) {
        if (!data.lightConnected) {
            lightEl.textContent = "--";
            lightStatus.textContent = "DISCONNECTED";
            lightStatus.style.color = "var(--danger)";
        } else {
            lightEl.textContent = Math.round(data.light);
            lightStatus.textContent = data.light >= 300 ? "OPTIMAL" : "LOW";
            lightStatus.style.color = data.light >= 300 ? "var(--warning)" : "var(--danger)";
        }
    }

    // ==========================================
    // DYNAMIC PLANT HEALTH SCORING
    // ==========================================
    let score = 100;
    let tempStatusText = "Optimal";
    let humStatusText = "Optimal";
    let soilStatusText = "Moist";
    let lightStatusText = "Good";

    // 1. Temperature Check (Target: < 30C)
    if (data.dhtConnected) {
        if (data.temp >= 30) {
            score -= 25;
            tempStatusText = "High";
        } else if (data.temp < 15) {
            score -= 15;
            tempStatusText = "Low";
        }
    } else {
        score -= 25;
        tempStatusText = "--";
    }

    // 2. Humidity Check (Target: 60% - 80%)
    if (data.dhtConnected) {
        if (data.hum > 85) {
            score -= 15;
            humStatusText = "High";
        } else if (data.hum < 50) {
            score -= 20;
            humStatusText = "Dry Air";
        }
    } else {
        humStatusText = "--";
    }

    // 3. Soil Moisture Check (Target: > 40%)
    if (data.soilConnected) {
        if (data.soil <= 40) {
            score -= 35;
            soilStatusText = "Dry";
        } else if (data.soil > 85) {
            score -= 10;
            soilStatusText = "Too Wet";
        }
    } else {
        score -= 35;
        soilStatusText = "--";
    }

    // 4. Light Check (Target: >= 300 Lux)
    if (data.lightConnected) {
        if (data.light < 300) {
            score -= 25;
            lightStatusText = "Low";
        }
    } else {
        lightStatusText = "--";
    }

    score = Math.max(0, score);

    // Update UI
    const healthScoreEl = document.getElementById("healthScore");
    const healthProgressEl = document.getElementById("healthProgress");
    
    if (healthScoreEl) {
        healthScoreEl.textContent = `${score}%`;
        if (score >= 80) healthScoreEl.style.color = "var(--primary)";
        else if (score >= 50) healthScoreEl.style.color = "var(--warning)";
        else healthScoreEl.style.color = "var(--danger)";
    }
    
    if (healthProgressEl) {
        healthProgressEl.style.width = `${score}%`;
        
        if (score >= 80) {
            healthProgressEl.style.background = "var(--primary)";
            healthProgressEl.style.boxShadow = "0 0 10px var(--primary-glow)";
        } else if (score >= 50) {
            healthProgressEl.style.background = "var(--warning)";
            healthProgressEl.style.boxShadow = "0 0 10px var(--warning-glow)";
        } else {
            healthProgressEl.style.background = "var(--danger)";
            healthProgressEl.style.boxShadow = "0 0 10px var(--danger-glow)";
        }
    }

    // Helper to update specific plant health texts
    function setMetricUI(id, text) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = text;
        
        el.className = "metric-value";
        if (text === "Optimal" || text === "Moist" || text === "Good") {
            el.classList.add("good");
        } else if (text === "Low" || text === "Too Wet" || text === "Dry Air") {
            el.classList.add("warning");
        } else if (text === "High" || text === "Dry" || text === "--") {
            el.classList.add("danger");
        }
    }

    setMetricUI("tempHealth", tempStatusText);
    setMetricUI("humidityHealth", humStatusText);
    setMetricUI("soilHealth", soilStatusText);
    setMetricUI("lightHealth", lightStatusText);
}

function logActivity(message, type = "success") {
    const container = document.getElementById("activityFeed");
    if (!container) return;
    
    const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const row = document.createElement("div");
    row.className = "activity-row";

    let color = "var(--primary)";
    if (type === "danger") color = "var(--danger)";
    if (type === "warning") color = "var(--warning)";
    if (type === "info") color = "var(--info)";

    row.innerHTML = `
        <div class="activity-dot" style="background:${color}; box-shadow:0 0 8px ${color};"></div>
        ${message}
        <span class="activity-time">${time}</span>
    `;

    container.prepend(row);
    while (container.children.length > 5) {
        container.removeChild(container.lastElementChild);
    }
}


function fetchESP32Data() {
    fetch('/api/sensors')
        .then(response => response.json())
        .then(data => {
            updateSensorUI(data);
            updateAutomationUI(data);

            const badge = document.getElementById("espBadge");
            const dot = document.getElementById("espDot");
            const text = document.getElementById("espText");

            if (data.esp32Connected) {
                text.textContent = "ESP32 CONNECTED";
                badge.style.color = "var(--primary)";
                dot.style.background = "var(--primary)";
                dot.style.boxShadow = "0 0 10px var(--primary)";
                dot.style.animation = "pulse 2s infinite";
            } else {
                text.textContent = "ESP32 DISCONNECTED";
                badge.style.color = "var(--danger)";
                dot.style.background = "var(--danger)";
                dot.style.boxShadow = "none";
                dot.style.animation = "none";
            }

            const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
            document.getElementById("footerStatus").textContent = `System online • Last sync at ${time}`;

            // I-compute ang live daily averages
            if (data.dhtConnected && data.soilConnected && data.lightConnected) {
                sumTemp += data.temp;
                sumHum += data.hum;
                sumSoil += data.soil;
                sumLight += data.light;
                readCount++;

                document.getElementById("avgTemp").textContent = (sumTemp / readCount).toFixed(1);
                document.getElementById("avgHum").textContent = Math.round(sumHum / readCount);
                document.getElementById("avgSoil").textContent = Math.round(sumSoil / readCount);
                document.getElementById("avgLight").textContent = Math.round(sumLight / readCount);
            }
        })
        .catch(err => {
            console.error("Connection error:", err);
            document.getElementById("footerStatus").textContent = "Connection lost";
        });
}

// Initial call
fetchESP32Data();
setInterval(fetchESP32Data, 2000);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log("SW Config Not Found"));
    });
}

// ---------- PWA Install Handling ----------
let deferredInstallPrompt = null;
const installBtn = document.getElementById('installBtn');

function isStandaloneMode() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIosDevice() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
}

window.addEventListener('beforeinstallprompt', (e) => {
    deferredInstallPrompt = e;
    console.log('[PWA] beforeinstallprompt captured — Install App button is now backed by the native prompt.');
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    if (installBtn) installBtn.style.display = 'none';
    logActivity('SmartGrow was installed to the home screen.', 'success');
});

function showIosInstallModal() {
    const modal = document.getElementById('iosInstallModal');
    if (modal) modal.style.display = 'flex';
}

function closeIosInstallModal() {
    const modal = document.getElementById('iosInstallModal');
    if (modal) modal.style.display = 'none';
}

async function handleInstallClick() {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        logActivity(`Install ${choice.outcome === 'accepted' ? 'started' : 'dismissed'} by user.`, 'info');
        deferredInstallPrompt = null;
    } else if (isIosDevice()) {
        showIosInstallModal();
    } else {
        alert('To install SmartGrow:\n\nOpen your browser menu (⋮ or the Share icon) and choose "Add to Home screen" or "Install app".\n\nIf that option is missing, this page may need to be loaded over HTTPS first.');
    }
}

if (isStandaloneMode() && installBtn) {
    installBtn.style.display = 'none';
}

if (isIosDevice() && !isStandaloneMode()) {
    window.addEventListener('load', () => setTimeout(showIosInstallModal, 1200));
}

// =========================================================
// MOBILE TAB SWITCHER LOGIC
// =========================================================
function switchTab(viewName, element, eventObj) {
    if (window.innerWidth <= 768) {
        if (eventObj) eventObj.preventDefault(); // Safely stop anchor jump
        
        // Clear previous view classes and add the selected one
        document.body.classList.remove('view-sensors', 'view-auto', 'view-history', 'view-health', 'view-export');
        document.body.classList.add('view-' + viewName);

        // Update active class on bottom navigation buttons
        document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
            item.classList.remove('active');
        });
        element.classList.add('active');

        // Smoothly scroll back to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Automatically show the Sensors tab on mobile page load
window.addEventListener('DOMContentLoaded', () => {
    if (window.innerWidth <= 768) {
        document.body.classList.add('view-sensors');
    }
});

// =========================================================
// RESPONSIVE VIEW RESIZE HANDLER
// =========================================================
window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
        // Remove mobile view classes when switching back to desktop
        document.body.classList.remove('view-sensors', 'view-auto', 'view-history', 'view-health', 'view-export');
    } else {
        // If resized down to mobile and no tab is active yet, default to sensors
        const hasActiveTab = document.body.classList.contains('view-sensors') ||
                             document.body.classList.contains('view-auto') ||
                             document.body.classList.contains('view-history') ||
                             document.body.classList.contains('view-health') ||
                             document.body.classList.contains('view-export');
        if (!hasActiveTab) {
            document.body.classList.add('view-sensors');
        }
    }
});