export default function AlertsScreen() {
  return (
    <div className="p-4">
      <section aria-labelledby="alerts-heading">
        <h2 id="alerts-heading" className="text-lg font-semibold mb-4 text-text-primary dark:text-dark-text-primary">
          Active Alerts
        </h2>
        <div className="bg-surface dark:bg-dark-surface rounded-lg p-6 text-center">
          <p className="text-text-secondary dark:text-dark-text-secondary">
            No active alerts for your lines
          </p>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="planned-heading">
        <h2 id="planned-heading" className="text-lg font-semibold mb-4 text-text-primary dark:text-dark-text-primary">
          Planned Work
        </h2>
        <div className="bg-surface dark:bg-dark-surface rounded-lg p-6 text-center">
          <p className="text-text-secondary dark:text-dark-text-secondary">
            No planned work affecting your lines
          </p>
        </div>
      </section>
    </div>
  );
}
