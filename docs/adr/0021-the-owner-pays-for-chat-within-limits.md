# 0021 The Owner Pays for Chat, Within Limits

Users never see a model, key or provider (LIN-85). Every account gets 5 chat messages a day across all its Trees, including today's Members of the first Tree, and the Owner can lift that for an account. `spelling-matches` does not count toward this allowance. A platform-wide monthly spending cap covers both `family-chat` and `spelling-matches`. When the cap is hit, both stop for everyone until next month or until the Owner raises it: spelling suggestions simply go missing, and saving a Person still works. Chat is optional: the rest of the app works without it. A Master Admin can switch chat off for their Tree, because chat sends family data to a model provider.

The next upgrade is one paid plan, bought per Tree by its Master Admin, which gives that Tree's Members a larger allowance.

## Considered Options

- **Users connect their own OpenRouter account.** Rejected: too much effort for users.
- **Only check that the account is bound to a Person.** Rejected: with open sign-up, anyone can create a Tree and be bound, so this limits nothing.

## Consequences

- The limits and the cap must exist at launch, since throwaway Google accounts cost the Owner money.
- The cap's dollar amount depends on what one chat message costs.
