# Running Rubble: admin tasks

These are the jobs that only the person who runs the app does. They need Fly access (`mise exec -- flyctl ...`) and are never done from the browser.

## Resetting a forgotten password

Rubble has usernames and passwords and no email addresses (ADR 0013). A player who forgets their password is told to email **game@tejastagra.com** with their username. The admin does the following.

### 1. Check it is really them

A username on its own is not enough. Reply and ask for:

- their **nickname and tag** as shown on their account page (for example `Pip Squeak #4f2a`), and
- the **name of an opponent from a recent game**, and roughly when they played it.

Reset only if both answers are right. If they cannot answer, do not reset: tell them that without the details the account cannot be handed over, and that they can still play as a new guest or make a new account.

### 2. Run the reset

```
mise exec -- flyctl ssh console -a comp4020-final-tejastagra -C "node scripts/admin-reset-password.ts <username>"
```

The command prints a **temporary password of 12 characters** once, on your terminal. It is not stored anywhere in plain text and it is not in the log: copy it now. If you lose it, run the command again, which sets a new one.

It prints an error and changes nothing when the username does not exist.

### 3. Send it to the player

Reply to their email with the temporary password and these steps: open Rubble, go to Account, tap Sign in, enter the username and the temporary password, then choose a new password when asked. The temporary password works for that one sign-in and stops working as soon as they have chosen a new password.

### What the app records

The log has one line, `admin_reset`, with the username and nothing else. Passwords, their hashes and session cookies are never logged.

### If the player has not signed in within a few days

Nothing expires on its own. If you are unsure whether the temporary password has been seen by someone else, run the reset again: it replaces the temporary password and signs out every other session of the account.
