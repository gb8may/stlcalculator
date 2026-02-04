import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const numberFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function volumeFromGeometryMm3(geometry) {
  const position = geometry.getAttribute("position");
  if (!position) return 0;

  const index = geometry.getIndex();
  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  let volume = 0;

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      v0.fromBufferAttribute(position, a);
      v1.fromBufferAttribute(position, b);
      v2.fromBufferAttribute(position, c);
      volume += v0.dot(v1.clone().cross(v2));
    }
  } else {
    for (let i = 0; i < position.count; i += 3) {
      v0.fromBufferAttribute(position, i);
      v1.fromBufferAttribute(position, i + 1);
      v2.fromBufferAttribute(position, i + 2);
      volume += v0.dot(v1.clone().cross(v2));
    }
  }

  return Math.abs(volume / 6);
}

export default function App() {
  const [location, setLocation] = useState("");
  const [printer, setPrinter] = useState("");
  const [resin, setResin] = useState("");
  const [pricePerLiter, setPricePerLiter] = useState(200);
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!files.length) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const loader = new STLLoader();

    async function parseFiles() {
      setIsLoading(true);
      const next = [];

      for (const file of files) {
        try {
          const buffer = await file.arrayBuffer();
          const geometry = loader.parse(buffer);
          const volumeMm3 = volumeFromGeometryMm3(geometry);
          next.push({ name: file.name, volumeMm3 });
        } catch (error) {
          next.push({
            name: file.name,
            error: "Could not read STL.",
          });
        }
      }

      if (!cancelled) {
        setResults(next);
        setIsLoading(false);
      }
    }

    parseFiles();
    return () => {
      cancelled = true;
    };
  }, [files]);

  const pricePerMl = pricePerLiter / 1000;

  const enrichedResults = useMemo(() => {
    return results.map((result) => {
      if (result.error) return result;
      const volumeMl = result.volumeMm3 / 1000;
      return {
        ...result,
        volumeMl,
        cost: volumeMl * pricePerMl,
      };
    });
  }, [results, pricePerMl]);

  const totals = useMemo(() => {
    return enrichedResults.reduce(
      (acc, result) => {
        if (!result.error) {
          acc.totalVolumeMl += result.volumeMl;
          acc.totalCost += result.cost;
          acc.validItems += 1;
        }
        return acc;
      },
      { totalVolumeMl: 0, totalCost: 0, validItems: 0 }
    );
  }, [enrichedResults]);

  return (
    <div className="app">
      <header className="hero">
        <div>
          <span className="eyebrow">STL Calculator</span>
          <h1>Smart resin printing estimator</h1>
          <p>
            Upload your STLs, set resin price, and get cost per piece and per
            project in seconds.
          </p>
        </div>
        <div className="hero-card">
          <div>
            <span>Total volume</span>
            <strong>{numberFormatter.format(totals.totalVolumeMl)} ml</strong>
          </div>
          <div>
            <span>Total cost</span>
            <strong>{currencyFormatter.format(totals.totalCost)}</strong>
          </div>
        </div>
      </header>

      <section className="card">
        <h2>Setup</h2>
        <div className="form-grid">
          <label>
            Location
            <input
              type="text"
              value={location}
              placeholder="e.g. Austin, TX"
              onChange={(event) => setLocation(event.target.value)}
            />
          </label>
          <label>
            Printer (model)
            <input
              type="text"
              value={printer}
              placeholder="e.g. Elegoo Saturn 3"
              onChange={(event) => setPrinter(event.target.value)}
            />
          </label>
          <label>
            Resin (brand/model)
            <input
              type="text"
              value={resin}
              placeholder="e.g. Anycubic Standard+"
              onChange={(event) => setResin(event.target.value)}
            />
          </label>
          <label>
            Resin price per liter (USD)
            <input
              type="number"
              min="0"
              step="10"
              value={pricePerLiter}
              onChange={(event) => setPricePerLiter(Number(event.target.value))}
            />
          </label>
        </div>
      </section>

      <section className="card uploader">
        <div>
          <h2>Upload STL</h2>
          <p>Select one or more files. Calculation runs locally.</p>
        </div>
        <label className="file-input">
          <input
            type="file"
            accept=".stl"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files || []))}
          />
          <span>Select files</span>
        </label>
      </section>

      <section className="card summary">
        <div className="badges">
          <span>{location || "Location not set"}</span>
          <span>{printer || "Printer not set"}</span>
          <span>{resin || "Resin not set"}</span>
        </div>
        <div className="metrics">
          <div>
            <span>Price per liter</span>
            <strong>{currencyFormatter.format(pricePerLiter)}</strong>
          </div>
          <div>
            <span>STL count</span>
            <strong>{results.length}</strong>
          </div>
          <div>
            <span>Valid items</span>
            <strong>{totals.validItems}</strong>
          </div>
        </div>
      </section>

      <section className="card table">
        <div className="table-header">
          <h2>STL breakdown</h2>
          {isLoading && <span className="loading">Calculating...</span>}
        </div>
        {enrichedResults.length === 0 ? (
          <p className="empty">
            Upload STL files to see the breakdown.
          </p>
        ) : (
          <div className="table-grid">
            <div>File</div>
            <div>Volume (mm³)</div>
            <div>Volume (ml)</div>
            <div>Cost</div>
            <div>Status</div>
            {enrichedResults.map((result) => (
              <div className="row" key={result.name}>
                <span>{result.name}</span>
                <span>
                  {result.error
                    ? "-"
                    : numberFormatter.format(result.volumeMm3)}
                </span>
                <span>
                  {result.error
                    ? "-"
                    : numberFormatter.format(result.volumeMl)}
                </span>
                <span>
                  {result.error
                    ? "-"
                    : currencyFormatter.format(result.cost)}
                </span>
                <span className={result.error ? "error" : "ok"}>
                  {result.error ? result.error : "OK"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
