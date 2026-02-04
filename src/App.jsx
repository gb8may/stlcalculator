import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Client, Account, Databases, Storage, ID, Query } from "appwrite";

const currencyFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
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

const appwriteConfig = {
  endpoint: import.meta.env.VITE_APPWRITE_ENDPOINT || "",
  projectId: import.meta.env.VITE_APPWRITE_PROJECT_ID || "",
  databaseId: import.meta.env.VITE_APPWRITE_DATABASE_ID || "",
  printersCollectionId:
    import.meta.env.VITE_APPWRITE_PRINTERS_COLLECTION_ID || "",
  resinsCollectionId:
    import.meta.env.VITE_APPWRITE_RESINS_COLLECTION_ID || "",
  uploadsCollectionId:
    import.meta.env.VITE_APPWRITE_UPLOADS_COLLECTION_ID || "",
  bucketId: import.meta.env.VITE_APPWRITE_BUCKET_ID || "",
};

export default function App() {
  const [user, setUser] = useState(null);
  const [appwriteReady, setAppwriteReady] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState("signin");
  const [statusMessage, setStatusMessage] = useState("");
  const [printers, setPrinters] = useState([]);
  const [resins, setResins] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [newPrinter, setNewPrinter] = useState({
    name: "",
    model: "",
    notes: "",
  });
  const [newResin, setNewResin] = useState({
    brand: "",
    model: "",
    pricePerLiter: 200,
  });
  const [selectedResinId, setSelectedResinId] = useState("");
  const [location, setLocation] = useState("");
  const [printer, setPrinter] = useState("");
  const [resin, setResin] = useState("");
  const [pricePerLiter, setPricePerLiter] = useState(200);
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [supportPercent, setSupportPercent] = useState(20);
  const [includeSupports, setIncludeSupports] = useState(true);
  const [selectedPreviewIndex, setSelectedPreviewIndex] = useState(0);
  const [previewGeometry, setPreviewGeometry] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const previewRef = useRef(null);
  const appwriteRef = useRef(null);

  useEffect(() => {
    const missing = [];
    if (!appwriteConfig.endpoint) missing.push("VITE_APPWRITE_ENDPOINT");
    if (!appwriteConfig.projectId) missing.push("VITE_APPWRITE_PROJECT_ID");
    if (!appwriteConfig.databaseId) missing.push("VITE_APPWRITE_DATABASE_ID");
    if (!appwriteConfig.printersCollectionId)
      missing.push("VITE_APPWRITE_PRINTERS_COLLECTION_ID");
    if (!appwriteConfig.resinsCollectionId)
      missing.push("VITE_APPWRITE_RESINS_COLLECTION_ID");
    if (!appwriteConfig.uploadsCollectionId)
      missing.push("VITE_APPWRITE_UPLOADS_COLLECTION_ID");
    if (!appwriteConfig.bucketId) missing.push("VITE_APPWRITE_BUCKET_ID");

    if (missing.length > 0) {
      setAppwriteReady(false);
      setStatusMessage(
        `Missing Appwrite env vars: ${missing.join(", ")}`
      );
      return;
    }

    try {
      const client = new Client()
        .setEndpoint(appwriteConfig.endpoint)
        .setProject(appwriteConfig.projectId);
      appwriteRef.current = {
        account: new Account(client),
        databases: new Databases(client),
        storage: new Storage(client),
      };
      setAppwriteReady(true);
    } catch (error) {
      setAppwriteReady(false);
      setStatusMessage(error.message || "Invalid Appwrite configuration.");
    }
  }, []);

  useEffect(() => {
    async function getUser() {
      if (!appwriteRef.current) return;
      try {
        const accountInfo = await appwriteRef.current.account.get();
        setUser(accountInfo);
      } catch (error) {
        setUser(null);
      }
    }

    getUser();
  }, []);

  useEffect(() => {
    if (!user || !appwriteRef.current) {
      setPrinters([]);
      setResins([]);
      setUploads([]);
      return;
    }

    async function loadData() {
      try {
        const [printersData, resinsData, uploadsData] = await Promise.all([
          appwriteRef.current.databases.listDocuments(
            appwriteConfig.databaseId,
            appwriteConfig.printersCollectionId,
            [Query.orderDesc("$createdAt")]
          ),
          appwriteRef.current.databases.listDocuments(
            appwriteConfig.databaseId,
            appwriteConfig.resinsCollectionId,
            [Query.orderDesc("$createdAt")]
          ),
          appwriteRef.current.databases.listDocuments(
            appwriteConfig.databaseId,
            appwriteConfig.uploadsCollectionId,
            [Query.orderDesc("$createdAt")]
          ),
        ]);

        setPrinters(printersData.documents ?? []);
        setResins(resinsData.documents ?? []);
        setUploads(uploadsData.documents ?? []);
      } catch (error) {
        setStatusMessage(error.message || "Could not load data.");
      }
    }

    loadData();
  }, [user]);

  useEffect(() => {
    if (!files.length) {
      setResults([]);
      setSelectedPreviewIndex(0);
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

  useEffect(() => {
    if (!files.length) {
      setPreviewGeometry(null);
      setPreviewError("");
      return;
    }

    const file = files[selectedPreviewIndex] || files[0];
    if (!file) return;
    const loader = new STLLoader();
    setPreviewError("");

    file
      .arrayBuffer()
      .then((buffer) => {
        const geometry = loader.parse(buffer);
        geometry.computeVertexNormals();
        setPreviewGeometry(geometry);
      })
      .catch(() => {
        setPreviewGeometry(null);
        setPreviewError("Unable to render STL preview.");
      });
  }, [files, selectedPreviewIndex]);

  useEffect(() => {
    if (!previewRef.current || !previewGeometry) return;

    const container = previewRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const material = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.2,
      roughness: 0.4,
    });
    const mesh = new THREE.Mesh(previewGeometry, material);
    scene.add(mesh);

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(5, 8, 10);
    scene.add(ambient, directional);

    previewGeometry.computeBoundingBox();
    const box = previewGeometry.boundingBox;
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    mesh.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    camera.near = maxDim / 100;
    camera.far = maxDim * 10;
    camera.position.set(0, 0, maxDim * 1.8);
    camera.updateProjectionMatrix();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.dispose();
      material.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [previewGeometry]);

  const pricePerMl = pricePerLiter / 1000;

  useEffect(() => {
    if (!selectedResinId) return;
    const resinItem = resins.find((item) => item.$id === selectedResinId);
    if (resinItem?.price_per_liter) {
      setPricePerLiter(Number(resinItem.price_per_liter));
    }
  }, [resins, selectedResinId]);

  const enrichedResults = useMemo(() => {
    return results.map((result) => {
      if (result.error) return result;
      const volumeMl = result.volumeMm3 / 1000;
      const supportVolumeMl = volumeMl * (supportPercent / 100);
      const totalVolumeMl = includeSupports
        ? volumeMl + supportVolumeMl
        : volumeMl;
      return {
        ...result,
        volumeMl,
        supportVolumeMl,
        totalVolumeMl,
        cost: totalVolumeMl * pricePerMl,
      };
    });
  }, [results, pricePerMl, supportPercent, includeSupports]);

  const totals = useMemo(() => {
    return enrichedResults.reduce(
      (acc, result) => {
        if (!result.error) {
          acc.totalVolumeMl += result.totalVolumeMl ?? result.volumeMl;
          acc.totalSupportMl += result.supportVolumeMl ?? 0;
          acc.totalCost += result.cost;
          acc.validItems += 1;
        }
        return acc;
      },
      { totalVolumeMl: 0, totalSupportMl: 0, totalCost: 0, validItems: 0 }
    );
  }, [enrichedResults]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setStatusMessage("");
    if (!authEmail || !authPassword) {
      setStatusMessage("Email and password are required.");
      return;
    }

    if (authMode === "signin") {
      try {
        if (!appwriteRef.current) return;
        await appwriteRef.current.account.createEmailPasswordSession(
          authEmail,
          authPassword
        );
        const accountInfo = await appwriteRef.current.account.get();
        setUser(accountInfo);
      } catch (error) {
        setStatusMessage(error.message || "Could not sign in.");
      }
      return;
    }

    try {
      if (!appwriteRef.current) return;
      await appwriteRef.current.account.create(
        ID.unique(),
        authEmail,
        authPassword
      );
      await appwriteRef.current.account.createEmailPasswordSession(
        authEmail,
        authPassword
      );
      const accountInfo = await appwriteRef.current.account.get();
      setUser(accountInfo);
    } catch (error) {
      setStatusMessage(error.message || "Could not create account.");
    }
  }

  async function handleSignOut() {
    if (!appwriteRef.current) return;
    await appwriteRef.current.account.deleteSession("current");
    setUser(null);
    setStatusMessage("");
  }

  async function handleAddPrinter(event) {
    event.preventDefault();
    if (!newPrinter.name || !newPrinter.model) {
      setStatusMessage("Printer name and model are required.");
      return;
    }
    try {
      if (!appwriteRef.current) return;
      await appwriteRef.current.databases.createDocument(
        appwriteConfig.databaseId,
        appwriteConfig.printersCollectionId,
        ID.unique(),
        {
          name: newPrinter.name,
          model: newPrinter.model,
          notes: newPrinter.notes,
        }
      );
      setNewPrinter({ name: "", model: "", notes: "" });
      setStatusMessage("Printer saved.");
      const data = await appwriteRef.current.databases.listDocuments(
        appwriteConfig.databaseId,
        appwriteConfig.printersCollectionId,
        [Query.orderDesc("$createdAt")]
      );
      setPrinters(data.documents ?? []);
    } catch (error) {
      setStatusMessage(error.message || "Could not save printer.");
    }
  }

  async function handleAddResin(event) {
    event.preventDefault();
    if (!newResin.brand || !newResin.model) {
      setStatusMessage("Resin brand and model are required.");
      return;
    }
    try {
      if (!appwriteRef.current) return;
      await appwriteRef.current.databases.createDocument(
        appwriteConfig.databaseId,
        appwriteConfig.resinsCollectionId,
        ID.unique(),
        {
          brand: newResin.brand,
          model: newResin.model,
          price_per_liter: newResin.pricePerLiter,
        }
      );
      setNewResin({ brand: "", model: "", pricePerLiter: 200 });
      setStatusMessage("Resin saved.");
      const data = await appwriteRef.current.databases.listDocuments(
        appwriteConfig.databaseId,
        appwriteConfig.resinsCollectionId,
        [Query.orderDesc("$createdAt")]
      );
      setResins(data.documents ?? []);
    } catch (error) {
      setStatusMessage(error.message || "Could not save resin.");
    }
  }

  async function handleUploadToAccount() {
    if (!user || !appwriteRef.current) {
      setStatusMessage("Sign in to upload files.");
      return;
    }
    if (!files.length) {
      setStatusMessage("Select STL files before uploading.");
      return;
    }
    setStatusMessage("");
    for (const file of files) {
      try {
        const createdFile = await appwriteRef.current.storage.createFile(
          appwriteConfig.bucketId,
          ID.unique(),
          file
        );
        await appwriteRef.current.databases.createDocument(
          appwriteConfig.databaseId,
          appwriteConfig.uploadsCollectionId,
          ID.unique(),
          {
            file_name: file.name,
            file_id: createdFile.$id,
            size_bytes: file.size,
          }
        );
      } catch (error) {
        setStatusMessage(error.message || "Upload failed.");
        return;
      }
    }

    const data = await appwriteRef.current.databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.uploadsCollectionId,
      [Query.orderDesc("$createdAt")]
    );
    setUploads(data.documents ?? []);
    setStatusMessage("Files uploaded successfully.");
  }

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

      <section className="card auth">
        <div className="auth-header">
          <div>
            <h2>Account</h2>
            <p>Save printers, resins, and uploads to your profile.</p>
          </div>
          {user && (
            <button className="secondary" type="button" onClick={handleSignOut}>
              Sign out
            </button>
          )}
        </div>
        {!appwriteReady && (
          <p className="error">
            Appwrite is not configured. Check your environment variables and
            redeploy.
          </p>
        )}
        {user ? (
          <p className="status">Signed in as {user.email}</p>
        ) : (
          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <div className="form-grid">
              <label>
                Email
                <input
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  placeholder="••••••••"
                />
              </label>
            </div>
            <div className="auth-actions">
              <button type="submit" className="primary">
                {authMode === "signin" ? "Sign in" : "Create account"}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  setAuthMode(authMode === "signin" ? "signup" : "signin")
                }
              >
                {authMode === "signin"
                  ? "Need an account? Sign up"
                  : "Already have an account? Sign in"}
              </button>
            </div>
          </form>
        )}
        {statusMessage && <p className="status">{statusMessage}</p>}
      </section>

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
            Resin from library
            <select
              value={selectedResinId}
              onChange={(event) => setSelectedResinId(event.target.value)}
              disabled={!appwriteReady}
            >
              <option value="">Select saved resin</option>
              {resins.map((item) => (
                <option key={item.$id} value={item.$id}>
                  {item.brand} {item.model}
                </option>
              ))}
            </select>
          </label>
          <label>
            Resin price per liter (CAD)
            <input
              type="number"
              min="0"
              step="10"
              value={pricePerLiter}
              onChange={(event) => setPricePerLiter(Number(event.target.value))}
            />
          </label>
          <label>
            Support estimate ({supportPercent}%)
            <input
              type="range"
              min="0"
              max="100"
              value={supportPercent}
              onChange={(event) => setSupportPercent(Number(event.target.value))}
            />
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={includeSupports}
              onChange={(event) => setIncludeSupports(event.target.checked)}
            />
            Include supports in cost
          </label>
        </div>
        <p className="hint">
          Support volume is an estimate based on a percentage of model volume.
          For accurate values, use a slicer.
        </p>
      </section>

      <section className="card preview">
        <div className="preview-header">
          <div>
            <h2>STL Preview</h2>
            <p>Inspect the model and orbit with your mouse.</p>
          </div>
          <select
            value={selectedPreviewIndex}
            onChange={(event) =>
              setSelectedPreviewIndex(Number(event.target.value))
            }
            disabled={!files.length}
          >
            {files.length === 0 && <option>No file selected</option>}
            {files.map((file, index) => (
              <option key={file.name} value={index}>
                {file.name}
              </option>
            ))}
          </select>
        </div>
        <div className="preview-canvas" ref={previewRef}>
          {!previewGeometry && !previewError && (
            <p className="empty">Upload STL files to preview.</p>
          )}
          {previewError && <p className="error">{previewError}</p>}
        </div>
      </section>

      <section className="card library">
        <div>
          <h2>Library</h2>
          <p>Add printers and resins to reuse across projects.</p>
        </div>
        <div className="library-grid">
          <form onSubmit={handleAddPrinter}>
            <h3>Printers</h3>
            <label>
              Name
              <input
                type="text"
                value={newPrinter.name}
                onChange={(event) =>
                  setNewPrinter((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                placeholder="e.g. Main printer"
              />
            </label>
            <label>
              Model
              <input
                type="text"
                value={newPrinter.model}
                onChange={(event) =>
                  setNewPrinter((prev) => ({
                    ...prev,
                    model: event.target.value,
                  }))
                }
                placeholder="e.g. Elegoo Saturn 3"
              />
            </label>
            <label>
              Notes
              <input
                type="text"
                value={newPrinter.notes}
                onChange={(event) =>
                  setNewPrinter((prev) => ({
                    ...prev,
                    notes: event.target.value,
                  }))
                }
                placeholder="Build plate, settings, etc."
              />
            </label>
            <button
              type="submit"
              className="primary"
              disabled={!user || !appwriteReady}
            >
              Save printer
            </button>
            {!user && <p className="hint">Sign in to save printers.</p>}
            <ul className="item-list">
              {printers.map((item) => (
                <li key={item.$id}>
                  <strong>{item.name}</strong> · {item.model}
                </li>
              ))}
            </ul>
          </form>
          <form onSubmit={handleAddResin}>
            <h3>Resins</h3>
            <label>
              Brand
              <input
                type="text"
                value={newResin.brand}
                onChange={(event) =>
                  setNewResin((prev) => ({
                    ...prev,
                    brand: event.target.value,
                  }))
                }
                placeholder="e.g. Anycubic"
              />
            </label>
            <label>
              Model
              <input
                type="text"
                value={newResin.model}
                onChange={(event) =>
                  setNewResin((prev) => ({
                    ...prev,
                    model: event.target.value,
                  }))
                }
                placeholder="e.g. Standard+"
              />
            </label>
            <label>
              Price per liter (CAD)
              <input
                type="number"
                min="0"
                step="10"
                value={newResin.pricePerLiter}
                onChange={(event) =>
                  setNewResin((prev) => ({
                    ...prev,
                    pricePerLiter: Number(event.target.value),
                  }))
                }
              />
            </label>
            <button
              type="submit"
              className="primary"
              disabled={!user || !appwriteReady}
            >
              Save resin
            </button>
            {!user && <p className="hint">Sign in to save resins.</p>}
            <ul className="item-list">
              {resins.map((item) => (
                <li key={item.$id}>
                  <strong>{item.brand}</strong> · {item.model} ·{" "}
                  {currencyFormatter.format(item.price_per_liter || 0)}
                </li>
              ))}
            </ul>
          </form>
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
        <button
          type="button"
          className="primary"
          onClick={handleUploadToAccount}
          disabled={!user || !files.length || !appwriteReady}
        >
          Upload to account
        </button>
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
          <div>
            <span>Support volume</span>
            <strong>{numberFormatter.format(totals.totalSupportMl)} ml</strong>
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
            <div>Supports (ml)</div>
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
                    : numberFormatter.format(result.supportVolumeMl)}
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

      <section className="card uploads">
        <h2>Uploaded STL files</h2>
        {!user ? (
          <p className="empty">Sign in to see your uploads.</p>
        ) : uploads.length === 0 ? (
          <p className="empty">No uploads yet.</p>
        ) : (
          <ul className="item-list">
            {uploads.map((item) => (
              <li key={item.$id}>
                <strong>{item.file_name}</strong> · {item.size_bytes} bytes
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
