import { useParams, Link } from "react-router-dom";

export default function StationScreen() {
  const { stationId } = useParams<{ stationId: string }>();

  return (
    <div className="p-4">
      <nav className="mb-4">
        <Link
          to="/"
          className="text-mta-primary dark:text-blue-400 hover:underline"
        >
          ← Back
        </Link>
      </nav>

      <h2 className="text-xl font-bold mb-4 text-text-primary dark:text-dark-text-primary">
        Station {stationId}
      </h2>

      <section aria-labelledby="uptown-heading" className="mb-6">
        <h3 id="uptown-heading" className="text-lg font-semibold mb-3 text-text-primary dark:text-dark-text-primary">
          Uptown / Bronx-bound
        </h3>
        <div className="bg-surface dark:bg-dark-surface rounded-lg p-4">
          <p className="text-text-secondary dark:text-dark-text-secondary text-center">
            Loading arrivals...
          </p>
        </div>
      </section>

      <section aria-labelledby="downtown-heading" className="mb-6">
        <h3 id="downtown-heading" className="text-lg font-semibold mb-3 text-text-primary dark:text-dark-text-primary">
          Downtown / Brooklyn-bound
        </h3>
        <div className="bg-surface dark:bg-dark-surface rounded-lg p-4">
          <p className="text-text-secondary dark:text-dark-text-secondary text-center">
            Loading arrivals...
          </p>
        </div>
      </section>

      <div className="flex justify-between items-center">
        <button className="px-4 py-2 text-mta-primary dark:text-blue-400 font-medium min-h-touch">
          + Add to favorites
        </button>
        <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
          Updated just now
        </p>
      </div>
    </div>
  );
}
