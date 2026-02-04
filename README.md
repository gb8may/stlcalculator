# stlcalculator

Calculator to estimate resin printing costs from STL files.

## React app

1. Install dependencies:

```
npm install
```

2. Run the app:

```
npm run dev
```

## Appwrite setup (database + storage)

1. Create an Appwrite project (cloud or self-hosted).
2. Create a database and three collections:
   - Printers: `name` (string), `model` (string), `notes` (string, optional)
   - Resins: `brand` (string), `model` (string), `price_per_liter` (number)
   - Uploads: `file_name` (string), `file_id` (string), `size_bytes` (number)
3. Set collection permissions to **Authenticated** for read/write (or use your own rules).
4. Create a storage bucket for STL files and allow **Authenticated** read/write.
5. Set environment variables:

```
cp env.example .env.local
```

Edit `.env.local` with your Appwrite values:

```
VITE_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=your-project-id
VITE_APPWRITE_DATABASE_ID=your-database-id
VITE_APPWRITE_PRINTERS_COLLECTION_ID=your-printers-collection-id
VITE_APPWRITE_RESINS_COLLECTION_ID=your-resins-collection-id
VITE_APPWRITE_UPLOADS_COLLECTION_ID=your-uploads-collection-id
VITE_APPWRITE_BUCKET_ID=your-bucket-id
```

## How to use

- Fill in location, printer, resin, and price per liter.
- Upload one or more STL files.
- The app calculates volume and cost per STL and per project locally.

> Note: if the STL is not watertight, the volume may be underestimated.
