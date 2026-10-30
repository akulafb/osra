# 0017 One Hosted App, Many Trees

Osra becomes one app the Owner hosts, holding every Tree, and any Tree can be exported at any time (LIN-85). Trees are shared between relatives, so storing them on a user's device would still need a hosted sync service, and hosting is the only option with nothing for users to set up.

## Considered Options

- **Each user runs their own backend.** Rejected: it is the setup the platform exists to remove.
- **On-device storage with optional sync.** The strongest alternative, and a good fit for the later macOS and Android apps. Rejected as the foundation: relatives sharing a Tree would still depend on a hosted service. Offline stays a later addition to the native apps.

## Consequences

- The Owner is responsible for sensitive family data, including children's: privacy law, deletion requests and breaches.
- The Owner pays to run the platform, so anything costly per user, such as AI chat, needs its own way to be paid for.
