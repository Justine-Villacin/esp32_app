export function updateDateTime() {
    const dateElement = document.getElementById("currentDate");
    const now = new Date();
    const options = { weekday: "long", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };
    if (dateElement) dateElement.textContent = now.toLocaleDateString("en-US", options);
}

export function logActivity(message, type = "success") {
    const container = document.getElementById("activityFeed");
    if (!container) return;
    
    const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const row = document.createElement("div");
    row.className = "activity-row";

    let color = "var(--primary)";
    if (type === "danger") color = "var(--danger)";
    if (type === "warning") color = "var(--warning)";
    if (type === "info") color = "var(--info)";

    row.innerHTML = `${message}
    ${time}
`;

container.prepend(row);
while (container.children.length > 5) {
    container.removeChild(container.lastElementChild);
}}

window.logActivity = logActivity; // Expose to global scope for inline HTML onclick handlers