# Wildlife Safety Network (WSN)

Wildlife Safety Network (WSN) is a community-focused platform for citizens of Victoria Falls to report wildlife sightings near people and view where animals have been seen. The goal is to help residents and visitors stay informed, avoid dangerous encounters, and share timely safety information.

> WSN is under active development.

## Project Goals

- Allow users to report animals seen near people or public areas.
- Help people view recent wildlife locations and nearby safety alerts.
- Encourage fast, community-based reporting of potential wildlife risks.
- Support responsible wildlife safety through clear, location-based information.

## Applications

This repository is organized into separate applications:

```text
apps/
|-- backend/    REST API and server-side application
|-- frontend/   Web application
`-- mobile/     Mobile application
```

The frontend and mobile applications have not yet been created.

## Technology

### Backend

- Node.js
- Express.js
- CORS
- ES modules

## Getting Started

### Prerequisites

- Node.js 20 or newer
- npm

### Backend Setup

From the repository root:

```bash
cd apps/backend
npm install
node server.js
```

The backend currently starts on port `3001`.

```text
http://localhost:3001
```

For development, Nodemon is also installed:

```bash
npx nodemon server.js
```

## API Status

The backend currently provides only a running Express server. Reporting, authentication, location data, alert, and map endpoints will be documented as they are implemented.

## Development Status

Completed:

- Backend project initialization
- Express server setup
- ES module configuration
- CORS dependency setup

Planned:

- Wildlife sighting reports
- Report location and timestamp fields
- Animal type and encounter details
- Public safety alerts
- Recent sightings map
- User authentication
- Web frontend
- Mobile application
- Database integration
- Input validation and moderation
- Tests and API documentation

## Contributing

1. Create a feature branch from `main`.
2. Make focused changes and test them locally.
3. Use clear commit messages, for example:

   ```text
   feat(backend): add wildlife report endpoint
   fix(backend): validate sighting coordinates
   docs: update backend setup instructions
   ```

4. Open a pull request with a summary of the changes.
