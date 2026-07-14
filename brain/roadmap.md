# Product Roadmap (roadmap.md)

This document maps out future enhancements, technical debt resolution, and feature milestones for NoteMitra.

---

## Phase 1: Robust P2P and CDN Enhancements
- **Enhanced Backup Store**: Make the fallback storage dynamically replicate between GridFS and Cloudinary.
- **Client Compression**: Auto-compress PDF uploads on the client side before sending them over the network.
- **Offline Notes Access**: Leverage service workers safely (using specific cache-busting configurations) to support offline PDF reading.

---

## Phase 2: User Engagement & Social Integration
- **Advanced Leaderboard Analytics**: Include semester-specific filters to showcase rising uploaders.
- **Bookmarks & Custom Folders**: Allow students to organize saved notes into virtual notebooks or revision playlists.
- **AI Recommendation Engine**: Feed notes descriptors into a micro-model to recommend related study materials.

---

## Phase 3: AI Document Processing
- **Automatic Summary Extraction**: Use server-side PDF text extraction and AI parsing to autogenerate tags, branch mapping, and description suggestions when a file is uploaded.
