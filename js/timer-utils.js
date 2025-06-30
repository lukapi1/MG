export class Timer {
  constructor() {
    this.startTime = 0;
    this.interval = null;
    this.elapsed = 0;
    this.isRunning = false;
  }

  start(callback) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startTime = Date.now() - this.elapsed;
    this.interval = setInterval(() => {
      this.elapsed = Date.now() - this.startTime;
      callback(this.getFormattedTime());
    }, 10);
  }

  stop() {
    clearInterval(this.interval);
    this.isRunning = false;
  }

  reset() {
    this.stop();
    this.elapsed = 0;
    return "00:00.00";
  }

  getFormattedTime() {
    const date = new Date(this.elapsed);
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    const milliseconds = String(Math.floor(date.getUTCMilliseconds() / 10)).padStart(2, '0');
    return `${minutes}:${seconds}.${milliseconds}`;
  }

  getRawTime() {
    return this.elapsed;
  }
}

export function createLogEntry(track, timeDisplay, timeRaw, email) {
  const now = new Date();
  const dateStr = now.toLocaleString();
  
  const li = document.createElement("li");
  li.classList.add("log-entry");
  li.dataset.track = track;
  li.dataset.timeDisplay = timeDisplay;
  li.dataset.timeRaw = timeRaw;

  const entryText = document.createElement("span");
  entryText.textContent = `${dateStr} - ${track} - ${timeDisplay} - ${email}`;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "upload-checkbox";

  li.appendChild(entryText);
  li.appendChild(checkbox);

  return li;
}

export function exportToCSV(logId) {
  const logItems = document.querySelectorAll(`#${logId} li`);
  if (logItems.length === 0) return false;

  let csvContent = "data:text/csv;charset=utf-8,Data i czas,Wynik\n";
  logItems.forEach(item => {
    const parts = item.textContent.split(" - ");
    csvContent += `${parts[0]},${parts[1]}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "dziennik_motogym.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  return true;
}

export function createStatusBadge(icon) {
  const span = document.createElement("span");
  span.style.color = icon === '✅' ? '#28a745' : '#dc3545';
  span.style.marginLeft = '10px';
  span.textContent = icon;
  return span;
}