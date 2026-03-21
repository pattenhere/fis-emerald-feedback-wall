import { handleApiRequest } from "../../../server/api.mjs";

export default async function handler(request, response) {
  await handleApiRequest(request, response);
}
