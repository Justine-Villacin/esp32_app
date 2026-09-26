export function updateAutomationUI(data) {
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

export function updateSensorUI(data) {
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

    // Update UI Elements
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

    // Helper to update specific plant health metrics
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