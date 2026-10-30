# 0020 Roles Belong to a Tree, and the Owner Has No In-App Access to Other Trees

Every role applies inside one Tree: one Master Admin, any number of Admins, and Members who keep the 1-Degree Network write rule (LIN-85). Admins hold today's `admin` powers, limited to that Tree. This amends ADR 0013: `is_admin()` becomes admin of that Tree. There is no global admin role, so in the app the Owner sees another Tree only if its Master Admin invites them. Every Member reads the whole Tree they belong to, and Admins can remove a Member.

Direct database access stays available to the Owner for legal requests and emergencies.

## Consequences

- Today's global `users.role` goes away. The Owner becomes Master Admin of the first Tree, and today's admins become its Admins.
- A divorced spouse who stays a Member can still see their ex's new family. Removing them is the remedy.
