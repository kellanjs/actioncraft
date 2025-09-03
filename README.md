⚠️🚧 The library hasn't reached a stable release yet. Expect bugs and potentially breaking API changes until then.

# Actioncraft

Streamline your server actions.

- **🔒 Full Type Safety** - End-to-end TypeScript inference from input to output
- **📝 Schema Validation** - Works with Zod and any Standard Schema V1 compliant library
- **🎯 Fluent API** - Readable, discoverable builder pattern
- **⚡ Progressive Enhancement** - Works with and without JavaScript enabled
- **🔄 React Integration** - Built-in support for `useActionState` and form handling
- **🛡️ Error Management** - Structured error handling with custom error types
- **🔗 Lifecycle Hooks** - Callbacks for start, success, error, and completion events
- **📋 Form State Preservation** - Automatic form value retention on validation errors

## Table of Contents

- [Quick Start](#quick-start)
  - [Installation](#installation)
  - [Overview](#overview)
  - [Example](#example)
  - [Result Format](#result-format)
- [Walkthrough](#walkthrough)
  - [.config() - Configure Your Action](#config)
  - [.schemas() - Add Validation](#schemas)
  - [.errors() - Define Custom Errors](#errors)
  - [.handler() - Implement Business Logic](#handler)
  - [.callbacks() - Add Lifecycle Hooks](#callbacks)
- [Using Your Actions](#using-your-actions)
  - [Basic Usage](#basic-usage)
  - [Error Handling](#error-handling)
  - [React Forms with useActionState](#react-forms-with-useactionstate)
  - [Progressive Enhancement](#progressive-enhancement)
- [Complete Example](#complete-example)
- [Advanced Features](#advanced-features)
  - [Bind Arguments](#bind-arguments)
- [Utilities](#utilities)
  - [Type Inference](#type-inference)
  - [Input Validation](#input-validation)
- [Integration Utilities](#integration-utilities)
  - [Actioncraft Errors](#actioncraft-errors)
  - [React Query](#react-query)

## Quick Start

### Installation

```sh
npm install @kellanjs/actioncraft
```

### Overview

Actioncraft makes it easy to create type-safe server actions with first-class error-handling support.

The library supports two different syntax patterns, aptly referred to as the `action() api` and the `craft() api`. Both are functionally the same, so use whichever you prefer!

For the sake of simplicity, this document will use the same pattern (the `action() api`) for all usage examples, but either pattern would produce the exact same result.

#### action() api

```typescript
export const example = action() // We call action() first to create a builder to use
  .config(...)
  .schemas(...)
  .errors(...)
  .handler(...)
  .callbacks(...)
  .craft(); // And we call craft() last to build and return your type-safe server action
```

#### craft() api

```typescript
// We call craft() first, and it provides us with a builder to use
export const example = craft(async (action) =>
  action
    .config(...)
    .schemas(...)
    .errors(...)
    .handler(...)
    .callbacks(...)
    // No craft() needed here, because it's already wrapping everything!
);
```

Actioncraft uses a fluent builder design, making it simple to chain one method after the next to create a full-featured server action. Regardless of which syntax pattern you use, the order in which the methods are defined is important for type inference to work properly, so you'll see the same structure repeated often throughout the documentation. Always make sure to chain your methods together like this for the best experience!

### Example

With this basic structure in mind, let's see what a more detailed example looks like:

```typescript
"use server";

import { action } from "@kellanjs/actioncraft";
import { z } from "zod";

const newUserInputSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  age: z.number(),
});

export const createNewUser = action()
  // Define configuration settings
  .config({
    validationErrorFormat: "nested",
  })
  // Define the validation schema
  .schemas({
    inputSchema: newUserInputSchema,
  })
  // Define any errors that can occur in your action
  .errors({
    unauthorized: () =>
      ({
        type: "UNAUTHORIZED",
        message: "You don't have permission to create users",
      }) as const,
    emailTaken: (email: string) =>
      ({
        type: "EMAIL_TAKEN",
        message: `The email "${email}" is already registered`,
        email,
      }) as const,
  })
  // Define your server action logic
  .handler(async ({ input, errors }) => {
    // These are your validated input values
    const { name, email, age } = input;

    // If an error occurs, just return the result of the appropriate error function
    if (!hasPermission()) return errors.unauthorized();

    if (await emailExists(email)) return errors.emailTaken(email);

    // Additional business logic here...

    return { newUser };
  })
  // Define lifecycle callbacks
  .callbacks({
    onSettled: ({ result }) => {
      // Log what happened if you want
    },
  })
  .craft();
```

### Result Format

Server actions work best when you're returning serializable data. Throwing errors is less effective in this context, because Next.js will sanitize Error class objects that are thrown in your action, leaving you without useful error information on the client. You might see something in development, but in production, if you try to display `error.message`, you'll likely see something along the lines of: "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details."

Actioncraft was designed with this fundamental behavior in mind! Instead of throwing errors, we're working exclusively with structured, serializable objects every step of the way, so errors in your action will always return the data you need.

The default result format should feel pretty familiar: `{ success: true, data: T } | { success: false, error: E }`

We'll look at errors in more detail later. But here's a simple example of one way you might work with an action result on the client:

```typescript
const handleCreateNewUser = async (userData) => {
  // Call your server action like you normally would and get the result
  const result = await createNewUser(userData);

  if (result.success) {
    // If the action was successful, then you get back typed return data
    toast.success("User created:", result.data.newUser);
  } else {
    // If the action was unsuccessful, then you get fully typed error handling
    switch (result.error.type) {
      case "INPUT_VALIDATION":
        handleInputValidationErrorLogic();
        break;
      case "EMAIL_TAKEN":
        showError(`Email ${result.error.email} is already taken`);
        break;
      case "UNAUTHORIZED":
        handleAuthErrorLogic();
        break;
      case "UNHANDLED":
        handleUncaughtExceptions();
        break;
    }
  }
};
```

## Walkthrough

Now that we've covered the basic structure of an action and looked at a simple example, let's take a more detailed look at how Actioncraft works and what you can do with it.

### .config()

Actioncraft provides several configuration options to customize your action. Sensible defaults are provided, so you only need to define the `config` if you specifically want to override something. When you want to customize a certain behavior, just pass a configuration object:

```typescript
export const getUser = action()
  .config({
    name: "getUser",
    useActionState: true,
    resultFormat: "functional",
    validationErrorFormat: "nested",
    handleThrownError: (error) => ({
      type: "CUSTOM_ERROR",
      message: error.message,
    }) as const,
  })
  .schemas(...)
  .errors(...)
  .handler(...)
  .callbacks(...)
  .craft();
```

#### `name: string`

**Default:** `undefined`

An optional identifier for your action that will be included in error messages to help with debugging:

```typescript
export const updateUserProfile = action()
  .config({ name: "updateUserProfile" })
  .schemas({ inputSchema: userSchema })
  .handler(async ({ input }) => {
    // Your handler logic
  })
  .craft();

// If validation fails, the error message will be:
// "Input validation failed in action \"updateUserProfile\""
// instead of just:
// "Input validation failed"
```

#### `useActionState: boolean`

**Default:** `false`

Set to `true` to make your action compatible with React's `useActionState` hook:

```typescript
export const getUser = action()
  .config({ useActionState: true })
  .schemas(...)
  .errors(...)
  .handler(...)
  .callbacks(...)
  .craft();

// Now you can use it with useActionState in your client components like this:
const [state, action] = useActionState(getUser, initial(getUser));
```

#### `resultFormat: "api" | "functional"`

**Default:** `"api"`

Actioncraft supports two different return formats:

- **`"api"`**: `{ success: true, data: T } | { success: false, error: E }`
- **`"functional"`**: `{ type: "ok", value: T } | { type: "err", error: E }`

#### `validationErrorFormat: "flattened" | "nested"`

**Default:** `"flattened"`

Controls how validation errors are structured:

- **`"flattened"`**: Returns a flat array of error messages
- **`"nested"`**: Returns a nested object matching your schema structure

#### `handleThrownError: (error: unknown) => UserDefinedError`

By default, Actioncraft catches thrown errors and returns a structured error with type `"UNHANDLED"`. You can customize this behavior by passing an error handler function of your own:

```typescript
export const getUser = action()
  .config({
    handleThrownError: (error) =>
      ({
        type: "CUSTOM_ERROR",
        message:
          error instanceof Error ? error.message : "Something went wrong",
        timestamp: new Date().toISOString(),
      }) as const,
  })
  .schemas(...)
  .errors(...)
  .handler(...)
  .callbacks(...)
  .craft();
```

You can even implement more complex logic if you want:

```typescript
handleThrownError: (error: unknown) => {
  if (error instanceof Error) {
    if (error.message.includes("ECONNREFUSED")) {
      return {
        type: "NETWORK_ERROR",
        message: "Unable to connect to external service",
        originalError: error.message,
      } as const;
    }

    if (error.message.includes("timeout")) {
      return {
        type: "TIMEOUT_ERROR",
        message: "Operation timed out",
        originalError: error.message,
      } as const;
    }

    if (error.message.includes("unauthorized")) {
      return {
        type: "AUTHENTICATION_ERROR",
        message: "Authentication failed",
        originalError: error.message,
      } as const;
    }

    // Generic error transformation
    return {
      type: "CUSTOM_HANDLED_ERROR",
      message: `Custom handler caught: ${error.message}`,
      originalError: error.message,
    } as const;
  }

  // Handle non-Error objects
  return {
    type: "UNKNOWN_ERROR_TYPE",
    message: "An unknown error occurred",
    originalError: String(error),
  } as const;
};
```

Actioncraft's types are smart enough to infer all of these possibilities back on the client:

```typescript
if (!result.success) {
  console.log(result.error.type);
  // type: "INPUT_VALIDATION" | "INITIAL_STATE" | "NETWORK_ERROR" | "TIMEOUT_ERROR" | "AUTHENTICATION_ERROR" | "CUSTOM_HANDLED_ERROR" | "UNKNOWN_ERROR_TYPE"
}
```

Pretty cool!

### .schemas()

With our action configured, let's add validation using schemas. Actioncraft supports any library that implements the **Standard Schema V1** interface. Validation is handled automatically - you just need to provide the schemas:

```typescript
export const getUser = action()
  .config(...)
  .schemas({
    inputSchema,
    outputSchema,
    bindSchemas,
  })
  .errors(...)
  .handler(...)
  .callbacks(...)
  .craft();
```

#### Schema Options

##### `inputSchema?: StandardSchemaV1`

Validates user input passed to the action. If validation fails, an "INPUT_VALIDATION" error is returned to the client.

##### `outputSchema?: StandardSchemaV1`

Validates the data returned from your action. If validation fails, an "OUTPUT_VALIDATION" error is passed to callbacks, but the client always receives an "UNHANDLED" error (this is not affected by `handleThrownError`).

##### `bindSchemas?: StandardSchemaV1[]`

Validates arguments bound to the action with `.bind()`. If validation fails, a "BIND_ARGS_VALIDATION" error is returned to the client.

### .errors()

Now that we have validation set up, let's define custom errors that our action can return. Actioncraft makes error handling really easy by letting you define structured error types:

```typescript
export const errorExamples = action()
  .config(...)
  .schemas(...)
  .errors({
    unauthorized: () =>
      ({
        type: "UNAUTHORIZED",
        message: "You don't have permission to perform this action",
      }) as const,
    notFound: (id: string) =>
      ({
        type: "NOT_FOUND",
        message: `User with ID ${id} not found`,
        id,
      }) as const,
    emailTaken: (email: string) =>
      ({
        type: "EMAIL_TAKEN",
        message: `The email "${email}" is already registered`,
        email,
      }) as const,
  })
  .handler(...)
  .callbacks(...)
  .craft();
```

#### Error Structure

Each error is defined as a function called an **ErrorDefinition**:

- **Takes any arguments** you want (like IDs, emails, etc.)
- **Returns a UserDefinedError** object with:
  - `type`: A string discriminator (required)
  - `message`: Human-readable error message (optional)
  - Any other custom fields you want

#### Why the `as const` Assertion?

The `as const` assertion is **required** for proper TypeScript inference. It ensures your error types are treated as literal types rather than generic:

```typescript
// ❌ Without 'as const' - TypeScript infers { type: string, message: string } :(
badErrorDefinition: () => ({ type: "ERROR", message: "Something went wrong" });

// ✅ With 'as const' - TypeScript infers { type: "ERROR", message: "Something went wrong" } :D
goodErrorDefinition: () =>
  ({ type: "ERROR", message: "Something went wrong" }) as const;
```

Always remember the `as const` assertion when you define your errors!

#### Reusing Common Errors

Since error definitions are just functions, you can easily share common errors between actions:

```typescript
// common-errors.ts
export const unauthorized = () =>
  ({
    type: "UNAUTHORIZED",
    message: "You don't have permission to perform this action",
  }) as const;

export const rateLimited = () =>
  ({
    type: "RATE_LIMITED",
    message: "Too many requests. Please try again later.",
  }) as const;

export const notFound = (resource: string, id: string) =>
  ({
    type: "NOT_FOUND",
    message: `${resource} with ID ${id} not found`,
    resource,
    id,
  }) as const;
```

```typescript
// get-user.ts
export const getUser = action()
  .config(...)
  .schemas(...)
  .errors({
    // Easily use common shared errors
    unauthorized,
    rateLimited,
    notFound,
    // Plus any action-specific errors you need
    emailTaken: (email: string) =>
      ({ type: "EMAIL_TAKEN", email }) as const,
  })
  .handler(...)
  .callbacks(...)
  .craft();
```

#### Using Errors in Your Action Handler

Once defined, you can use these errors in your handler logic. When an error occurs, just call and return that particular error function:

```typescript
export const getUser = action()
  .config(...)
  .schemas(...)
  .errors(...)
  .handler(async ({ input, errors }) => {
    // Check permissions
    if (!hasPermission(input.userId)) {
      return errors.unauthorized();
    }

    // Find user
    const user = await findUser(input.userId);
    if (!user) {
      return errors.notFound(input.userId);
    }

    // Success case
    return { user };
  })
  .callbacks(...)
  .craft();
```

### .handler()

The `handler` method is where you implement the core functionality of your server action. Actioncraft provides several helpful parameters to make things quick and easy for you:

```typescript
export const getUser = action()
  .config(...)
  .schemas(...)
  .errors(...)
  .handler(async ({ input, bindArgs, errors, metadata }) => {
    // Server action logic here
  })
  .callbacks(...)
  .craft();
```

#### Handler Parameters

##### `input`

Contains the validated input values (or `undefined` if no input schema was provided).

##### `bindArgs`

Contains an array of validated bound argument values (or an empty array if no bind schemas were provided).

##### `errors`

Contains all the ErrorDefinition functions you defined in the `.errors()` method.

##### `metadata`

Contains additional request information:

- `rawInput`: The original, unvalidated input data
- `rawBindArgs`: The original, unvalidated bound arguments array
- `prevState`: Previous state (when using `useActionState`)
- `actionId`: A unique identifier for the action instance

### .callbacks()

Sometimes you need to hook into the action lifecycle for logging, analytics, or other side effects. The `callbacks` method lets you define functions that run at key moments:

```typescript
export const getUser = action()
  .config(...)
  .schemas(...)
  .errors(...)
  .handler(...)
  .callbacks({
    onStart: ({metadata}) => { ... },
    onSuccess: ({data}) => { ... },
    onError: ({error}) => { ... },
    onSettled: ({ result }) => { ... },
  })
  .craft();
```

#### Callback Types

##### `onStart?: (params: { metadata }) => Promise<void> | void`

Executes first, before any validation or action logic has occurred.

##### `onSuccess?: (params: { data, metadata }) => Promise<void> | void`

Executes when your action completes successfully. The `data` parameter contains your action's typed return value.

##### `onError?: (params: { error, metadata }) => Promise<void> | void`

Executes when your action returns an error (custom errors, validation failures, or unhandled exceptions).

##### `onSettled?: (params: { result, metadata }) => Promise<void> | void`

Executes after your action completes, regardless of success or failure. Useful for cleanup or logging.

Note: All callback methods support async operations and won't affect your action's result, even if they throw errors.

## Using Your Actions

Now that you know how to build actions with Actioncraft, let's see how you can use them in your application.

### Basic Usage

You can call your action like any async function:

```typescript
// client-component.ts
const handleClick = async () => {
  const result = await createNewUser({
    name: "John",
    email: "john@example.com",
    age: 25,
  });

  if (result.success) {
    // Action succeeded
    console.log("User created:", result.data.newUser);
  } else {
    // Action failed
    console.log("Error:", result.error.type);
    console.log("Message:", result.error.message);
  }
};
```

### Error Handling

Thanks to some carefully crafted types, you can always determine exactly what kind of error you're dealing with:

```typescript
const result = await createNewUser(formData);

if (!result.success) {
  switch (result.error.type) {
    case "INPUT_VALIDATION":
      showValidationErrors(result.error.issues);
      break;
    case "UNAUTHORIZED":
      redirectToLogin();
      break;
    case "EMAIL_TAKEN":
      showError(`Email ${result.error.email} is already taken`);
      break;
    case "UNHANDLED":
      showGenericError();
      break;
  }
}
```

### React Forms with useActionState

For React forms, you can use actions configured for `useActionState`:

```typescript
export const updateUser = action()
  .config({ useActionState: true })
  .schemas(...)
  .errors(...)
  .handler(...)
  .callbacks(...)
  .craft();
```

When `useActionState: true` is set, your action's return type changes to include a `values` field. This field contains the raw input values that were last passed to the action. However, on successful executions where an input schema is defined, it contains the validated input values instead.

#### The `initial()` Helper

When using `useActionState`, you have to provide the hook with a proper initial state that matches the return type of your action. That's where Actioncraft's `initial` function comes in. It returns a special error object with type `"INITIAL_STATE"` that you can use to detect when the form hasn't been submitted yet:

```typescript
function UserForm() {
  const [state, action] = useActionState(updateUser, initial(updateUser));
  // `state` initializes as:
  // { success: false,
  //   error: { type: "INITIAL_STATE", message: "Action has not been executed yet" },
  //   values: undefined }

  return (
    <form action={action}>
      <input name="name" defaultValue={state.values?.name} />
      <input name="email" defaultValue={state.values?.email} />

      {!state.success && state.error.type !== "INITIAL_STATE" && (
        <p>Error: {state.error.message}</p>
      )}

      <button type="submit">Update User</button>
    </form>
  );
}
```

### Progressive Enhancement

By providing a schema which supports FormData, your action can work with or without JavaScript. For example, when using Zod, you can use the `zod-form-data` library to provide FormData support for your action:

```typescript
// This action handles FormData from server-side form submissions
export const createNewUser = action()
  .config({ useActionState: true })
  .schemas({
    inputSchema: zfd.formData({
      name: zfd.text(),
      email: zfd.text(z.string().email()),
    }),
  })
  .handler(async ({ input }) => {
    // Save the validated user data to database
    const user = await db.user.create({
      data: {
        name: input.name,
        email: input.email,
      },
    });

    // Send welcome email
    await sendWelcomeEmail(user.email);

    return { user };
  })
  .craft();
```

## Complete Example

Now that we've gone over how to create actions and how to use them on the client, let's check out a more thorough example that puts a lot of these ideas together:

```typescript
"use server";

import { action } from "@kellanjs/actioncraft";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const updateProfileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  bio: z.string().max(500, "Bio must be under 500 characters"),
});

export const updateProfile = action()
  .config({ useActionState: true })
  .schemas({ inputSchema: updateProfileSchema })
  .errors({
    unauthorized: () =>
      ({ type: "UNAUTHORIZED", message: "Please log in" }) as const,
    emailTaken: (email: string) =>
      ({
        type: "EMAIL_TAKEN",
        message: `Email ${email} is already taken`,
        email,
      }) as const,
    rateLimited: () =>
      ({
        type: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
      }) as const,
  })
  .handler(async ({ input, errors }) => {
    // Check authentication
    const session = await getSession();
    if (!session) return errors.unauthorized();

    // Check rate limiting
    if (await isRateLimited(session.userId)) {
      return errors.rateLimited();
    }

    // Check if email is taken
    const existingUser = await getUserByEmail(input.email);
    if (existingUser && existingUser.id !== session.userId) {
      return errors.emailTaken(input.email);
    }

    // Update user
    const updatedUser = await updateUser(session.userId, input);

    return { user: updatedUser };
  })
  .callbacks({
    onStart: ({ metadata }) => {
      // Track when profile updates begin
      analytics.track("profile_update_started", {
        userId: metadata.prevState?.success
          ? metadata.prevState.data?.user?.id
          : null,
      });
    },
    onSuccess: ({ data }) => {
      revalidatePath("/profile");
      logUserActivity(data.user.id, "profile_updated");
    },
    onError: ({ error }) => {
      if (error.type === "UNHANDLED") {
        logError("Profile update failed", error);
      }
    },
    onSettled: ({ result }) => {
      // Log completion for monitoring and analytics
      analytics.track("profile_update_completed", {
        success: result.success,
      });
    },
  })
  .craft();
```

```typescript
"use client";

import { useActionState } from "react";
import { updateProfile } from "./actions";
import { initial } from "@kellanjs/actioncraft";

export default function ProfileForm() {
  const [state, action] = useActionState(updateProfile, initial(updateProfile));

  return (
    <form action={action}>
      <input
        name="name"
        placeholder="Name"
        defaultValue={state.values?.name}
      />

      <input
        name="email"
        type="email"
        placeholder="Email"
        defaultValue={state.values?.email}
      />

      <textarea
        name="bio"
        placeholder="Bio"
        defaultValue={state.values?.bio}
      />

      {state.success && (
        <div className="success">
          <p>Profile updated successfully!</p>
        </div>
      )}

      {!state.success && state.error.type !== "INITIAL_STATE" && (
        <div className="error">
          {state.error.type === "EMAIL_TAKEN" && (
            <p>That email is already taken. Please use a different one.</p>
          )}
          {state.error.type === "UNAUTHORIZED" && (
            <p>Please log in to update your profile.</p>
          )}
          {state.error.type === "RATE_LIMITED" && (
            <p>Too many requests. Please try again later.</p>
          )}
          {state.error.type === "INPUT_VALIDATION" && (
            <ul>
              {state.error.issues.map((issue, i) => (
                <li key={i}>{issue.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button type="submit">Update Profile</button>
    </form>
  );
}
```

## Advanced Features

### Bind Arguments

Actioncraft supports binding arguments to actions. Just provide schemas, and you'll get the validated bindArgs values to use in the action handler.

If validation fails, an error with type `BIND_ARGS_VALIDATION` is returned to the client.

#### Example: Multi-Tenant Action

```typescript
export const createPost = action()
  .schemas({
    bindSchemas: [z.string()], // Organization ID
    inputSchema: z.object({
      title: z.string(),
      content: z.string(),
    }),
  })
  .handler(async ({ bindArgs, input }) => {
    const [organizationId] = bindArgs;

    const post = await db.post.create({
      data: {
        ...input,
        organizationId,
      },
    });

    return { post };
  })
  .craft();

// Create organization-specific actions
const createPostForOrgA = createPost.bind(null, "org-a-id");
const createPostForOrgB = createPost.bind(null, "org-b-id");

// Each bound action automatically includes the correct org ID
const result = await createPostForOrgA({
  title: "My Post",
  content: "Post content...",
});
```

#### Example: Configuration Binding

```typescript
export const sendEmail = action()
  .schemas({
    bindSchemas: [
      z.object({
        apiKey: z.string(),
        fromEmail: z.string(),
      }),
    ],
    inputSchema: z.object({
      to: z.string().email(),
      subject: z.string(),
      body: z.string(),
    }),
  })
  .handler(async ({ bindArgs, input }) => {
    const [config] = bindArgs;

    // Use the bound configuration
    const emailService = new EmailService(config.apiKey);
    const result = await emailService.send({
      from: config.fromEmail,
      to: input.to,
      subject: input.subject,
      body: input.body,
    });

    return { messageId: result.id };
  })
  .craft();

// Create environment-specific email actions
const sendProductionEmail = sendEmail.bind(null, {
  apiKey: process.env.PROD_EMAIL_API_KEY,
  fromEmail: "noreply@company.com",
});

const sendDevelopmentEmail = sendEmail.bind(null, {
  apiKey: process.env.DEV_EMAIL_API_KEY,
  fromEmail: "dev@company.com",
});
```

## Utilities

Actioncraft provides several utilities to help you work with your actions more effectively.

### Type Inference

These utilities extract useful type information from your actions.

#### Using `$Infer`

Every crafted action includes an `$Infer` property that provides direct access to all inferred types:

- **`$Infer.Input`** - The input type that the action expects
- **`$Infer.Data`** - The success data type from your action's return value
- **`$Infer.Errors`** - All possible error types your action can return
- **`$Infer.Result`** - The complete result type (success and error cases)

#### Type Extraction Example

```typescript
import { action } from "@kellanjs/actioncraft";
import { z } from "zod";

export const updateUser = action()
  .schemas({
    inputSchema: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().email(),
    }),
  })
  .errors({
    notFound: (id: string) => ({ type: "NOT_FOUND", id }) as const,
    unauthorized: () => ({ type: "UNAUTHORIZED" }) as const,
  })
  .handler(async ({ input, errors }) => {
    // ... implementation
    return { user: input, updatedAt: new Date() };
  })
  .craft();

// Extracted types using $Infer:
type ActionInput = typeof updateUser.$Infer.Input;
// { id: string, name: string, email: string }

type ActionData = typeof updateUser.$Infer.Data;
// { user: { id: string, name: string, email: string }, updatedAt: Date }

type ActionErrors = typeof updateUser.$Infer.Errors;
// { type: "NOT_FOUND", id: string } | { type: "UNAUTHORIZED" } |
// { type: "INPUT_VALIDATION", issues: ... } | { type: "UNHANDLED", message: string }

type ActionResult = typeof updateUser.$Infer.Result;
// { success: true, data: { user: UserInput, updatedAt: Date } } |
// { success: false, error: { type: "NOT_FOUND", id: string } | ... }
```

#### Using `Infer` Types

You can also use these alternative type inference utilities if you prefer:

```typescript
import type {
  InferInput,
  InferResult,
  InferData,
  InferErrors,
} from "@kellanjs/actioncraft";

type ActionInput = InferInput<typeof updateUser>;
type ActionResult = InferResult<typeof updateUser>;
type ActionData = InferData<typeof updateUser>;
type ActionErrors = InferErrors<typeof updateUser>;
```

These provide the exact same type information as the `$Infer` utility.

### Input Validation

#### Using `$validate`

Actioncraft provides a utility to help you easily validate data against a particular action's input schema. The `$validate` method is available on every crafted action by default, and runs the same validation logic used during action execution. This is especially useful when you want to perform client-side validation before calling an action:

```typescript
// On the server...
export const createUser = action()
  .schemas({ inputSchema: userSchema })
  .handler(async ({ input }) => ({ user: input }))
  .craft();

// On the client...
// Validate input without executing the action
const result = await createUser.$validate({
  name: "John",
  email: "john@example.com",
  age: 25,
});

if (result.success) {
  console.log("Valid input:", result.data);
  // Now we can call the action, knowing that input validation will succeed
} else {
  console.log("Validation failed:", result.error);
}
```

#### Validation Results

Returns `{ success: true, data: ValidatedInput }` on success, or `{ success: false, error: ValidationError }` on failure.

## Integration Utilities

Actioncraft comes with several utilities intended to make it easier to integrate with libraries like React Query.

### Actioncraft Errors

#### `ActioncraftError`

A standard Error class that wraps Actioncraft error data while preserving type information:

```typescript
// The error preserves all your action's error data in the `cause` property
if (error instanceof ActioncraftError) {
  console.log(error.message); // "Actioncraft Error: EMAIL_TAKEN - Email already exists"
  console.log(error.cause); // { type: "EMAIL_TAKEN", message: "Email already exists", email: "user@example.com" }
}
```

#### `unwrap(result)`

Extracts the data from a successful result or throws an `ActioncraftError`:

```typescript
const result = await createNewUser(data);
const userData = unwrap(result); // Throws if result.success === false
```

#### `throwable(action)`

Wraps an action to automatically throw errors as `ActioncraftError` instances instead of returning them as objects:

```typescript
const throwingAction = throwable(myAction);
const userData = await throwingAction(data); // Throws on error
```

#### `isActioncraftError(error, action)`

Type guard that checks if an error is an `ActioncraftError`. When called with just an error object, it performs basic structural validation. When called with both error and action, it additionally verifies that the error originated from that specific action, providing full type inference for that action's error types.

```typescript
try {
  const data = await throwable(updateUser)(userData);
  console.log("Updated user data", data); // We know data exists at this point
} catch (error) {
  // Basic usage - checks if error is any ActioncraftError
  if (isActioncraftError(error)) {
    console.log("This is an ActioncraftError:", error.cause.type);
    // error.cause has generic typing here
  }

  // Advanced usage - verifies error came from the given action
  if (isActioncraftError(error, updateUser)) {
    // error.cause is now typed with updateUser's specific error types
    switch (error.cause.type) {
      case "EMAIL_TAKEN":
        showError(`Email ${error.cause.email} is already taken`);
        break;
      case "UNAUTHORIZED":
        redirectToLogin();
        break;
      case "INPUT_VALIDATION":
        showValidationErrors(error.cause.issues);
        break;
    }
  }
}
```

**Key Differences:**

- **Without action parameter**: Performs basic structural validation, returns `true` for any `ActioncraftError`
- **With action parameter**: Additionally verifies the error originated from that specific action and provides full type inference for that action's error types

#### `getActionId(action)`

Utility to extract the unique ID from a crafted action. Useful for debugging and logging purposes.

### React Query

Now let's see how to use these utilities most effectively when working with React Query!

#### Usage with useQuery

Use the `unwrap()` utility for data fetching queries:

```typescript
import { useQuery } from "@tanstack/react-query";
import { fetchUserProfile } from "./actions";
import { unwrap } from "@kellanjs/actioncraft";

function UserProfile({ userId }: { userId: string }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ["user", userId],
    queryFn: async () => {
      const result = await fetchUserProfile({ userId });
      return unwrap(result); // Throws ActioncraftError on failure
    },
  });

  if (isLoading) return <div>Loading...</div>;

  if (error) {
    if (isActioncraftError(error, fetchUserProfile)) {
      // Full type inference for your action's specific error types
      switch (error.cause.type) {
        case "USER_NOT_FOUND":
          return <div>User not found</div>;
        case "UNAUTHORIZED":
          return <div>Please log in</div>;
        default:
          return <div>Error: {error.cause.message}</div>;
      }
    }
    return <div>Unexpected error occurred</div>;
  }

  return (
    <div>
      <h1>{data.user.name}</h1>
      <p>{data.user.email}</p>
    </div>
  );
}
```

If you're like me, and that query function is too verbose for your tastes, you can simplify it:

```typescript
queryFn: () => unwrap(fetchUserProfile({ userId }));
```

`unwrap` is designed to handle both Results and Promises of Results, and since React Query will handle awaiting the resolved Promise, this syntax will work just fine.

#### Usage with useMutation

Use the `throwable()` utility for mutations:

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateUserProfile } from "./actions";
import { throwable, isActioncraftError } from "@kellanjs/actioncraft";

function EditProfileForm() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: throwable(updateUserProfile), // Throws ActioncraftError on failure
    onSuccess: (data) => {
      // data is properly typed as your action's success data
      queryClient.invalidateQueries({ queryKey: ["user", data.user.id] });
    },
    onError: (error) => {
      if (isActioncraftError(error, updateUserProfile)) {
        // Handle specific error types with full type safety
        switch (error.cause.type) {
          case "UNAUTHORIZED":
            redirectToLogin();
            break;
          case "INPUT_VALIDATION":
            showValidationErrors(error.cause.issues);
            break;
          case "EMAIL_TAKEN":
            showToast(`Email ${error.cause.email} is already taken`);
            break;
          default:
            showToast(error.cause.message || "Update failed");
        }
      } else {
        showToast("An unexpected error occurred");
      }
    },
  });

  const handleSubmit = (formData: FormData) => {
    mutation.mutate(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Updating..." : "Update Profile"}
      </button>
    </form>
  );
}
```

## Thanks

If you made it this far, thanks for checking out the library, and I hope you find it useful in your projects!

## License

Actioncraft is open source under the terms of the [MIT license](https://github.com/kellanjs/actioncraft/blob/main/LICENSE).
