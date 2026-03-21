import { Link } from "react-router-dom";

export default function HomeScreen() {
  return (
    <div className="p-4">
      <section aria-labelledby="favorites-heading">
        <h2 id="favorites-heading" className="text-lg font-semibold mb-4 text-text-primary dark:text-dark-text-primary">
          Your Stations
        </h2>
        <div className="bg-surface dark:bg-dark-surface rounded-lg p-6 text-center">
          <p className="text-text-secondary dark:text-dark-text-secondary mb-4">
            No favorites yet
          </p>
          <Link
            to="/search"
            className="inline-flex items-center justify-center px-4 py-3 bg-mta-primary text-white rounded-lg font-medium min-h-touch hover:opacity-90 transition-opacity"
          >
            Add your first station
          </Link>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="commutes-heading">
        <h2 id="commutes-heading" className="text-lg font-semibold mb-4 text-text-primary dark:text-dark-text-primary">
          Your Commutes
        </h2>
        <div className="bg-surface dark:bg-dark-surface rounded-lg p-6 text-center">
          <p className="text-text-secondary dark:text-dark-text-secondary">
            Set up your commute for transfer suggestions
          </p>
        </div>
      </section>

      <p className="mt-6 text-center text-13 text-text-secondary dark:text-dark-text-secondary">
        Updated just now
      </p>
    </div>
  );
}
