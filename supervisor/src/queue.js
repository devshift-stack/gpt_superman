class InMemoryQueue {
  constructor() {
    this.jobs = [];
    this.processing = false;
    this.worker = null;
  }

  setWorker(fn) {
    this.worker = fn;
  }

  async add(job) {
    this.jobs.push(job);
    this.processNext();
  }

  async processNext() {
    if (this.processing) return;
    if (!this.worker) return;
    const job = this.jobs.shift();
    if (!job) return;
    this.processing = true;
    try {
      await this.worker(job);
    } catch (e) {
      console.error("[queue] Fehler bei Job-Verarbeitung:", e);
    } finally {
      this.processing = false;
      if (this.jobs.length > 0) {
        setImmediate(() => this.processNext());
      }
    }
  }

  getStats() {
    return {
      mode: "in-memory",
      waiting: this.jobs.length,
      active: this.processing ? 1 : 0
    };
  }
}

module.exports = { InMemoryQueue };
