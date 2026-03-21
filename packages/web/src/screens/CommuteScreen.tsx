import { Link } from "react-router-dom";

export default function CommuteScreen() {
  return (
    <div className="p-4">
      <section aria-labelledby="commutes-heading">
        <h2 id="commutes-heading" className="text-lg font-semibold mb-4 text-text-primary dark:text-dark-text-primary">
          Saved Commutes
        </h2>
        <div className="bg-surface dark:bg-dark-surface rounded-lg p-6 text-center">
          <p className="text-text-secondary dark:text-dark-text-secondary mb-4">
            No commutes configured
          </p>
          <Link
            to="/search"
            className="inline-flex items-center justify-center px-4 py-3 bg-mta-primary text-white rounded-lg font-medium min-h-touch hover:opacity-90 transition-opacity"
          >
            Plan a commute
          </Link>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="journal-heading">
        <h2 id="journal-heading" className="text-lg font-semibold mb-4 text-text-primary dark:text-dark-text-primary">
          Trip Journal
        </h2>
        <div className="bg-surface dark:bg-dark-surface rounded-lg p-6 text-center">
          <p className="text-text-secondary dark:text-dark-text-secondary">
            Your trip history will appear here
          </p>
        </div>
      </section>
    </div>
  );
}
