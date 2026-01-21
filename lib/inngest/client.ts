import { Inngest } from 'inngest';

// Create a single Inngest client for the entire app
export const inngest = new Inngest({
  id: 'dalat-app',
  name: 'Dalat Events',
});
