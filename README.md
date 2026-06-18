# RescueAI Backend

## Image Upload Service

This backend includes a Cloudinary-based upload endpoint for image attachments.

### Environment variables

Set these in `.env`:

```bash
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Endpoint

`POST /api/uploads/image`

- Auth: `Bearer <JWT>`
- Content-Type: `multipart/form-data`
- Form field: `image`
- Optional form field: `folder`

### Example request

```bash
curl -X POST http://localhost:3000/api/uploads/image \
  -H "Authorization: Bearer YOUR_JWT" \
  -F "image=@/path/to/image.jpg" \
  -F "folder=rescueai/incidents"
```

### Response

```json
{
  "success": true,
  "message": "Image uploaded successfully",
  "data": {
    "url": "https://res.cloudinary.com/...",
    "public_id": "rescueai/incidents/...",
    "width": 1024,
    "height": 768
  }
}
```

### Run

```bash
npm install
npm run dev
```

### Health check

```bash
curl http://localhost:3000/health
```
