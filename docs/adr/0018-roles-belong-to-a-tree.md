# 0018 Roles Belong to a Tree, and the Owner Has No Global Access

Every role applies inside one Tree: one Master Admin, any number of Admins, and Members who keep the 1-Degree Network write rule (LIN-85). There is no global admin role, so the Owner sees another family's Tree only if its Master Admin invites them. Every Member reads the whole Tree they belong to, and Admins can remove a Member.

Direct database access stays available to the Owner for legal requests and emergencies only.

## Consequences

- Today's global `users.role` goes away. The Owner becomes Master Admin of the first Tree, and today's admins become its Admins.
- A divorced spouse who stays a Member can still see their ex's new family. Removing them is the remedy.
