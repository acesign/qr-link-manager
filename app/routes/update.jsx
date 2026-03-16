import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { shopifyApi, LATEST_API_VERSION } from "@shopify/shopify-api";

export async function action({ request }) {
  try {
    const { session, shop } = await authenticate.public.appProxy(request);

    const client = new shopifyApi({
      apiKey: process.env.SHOPIFY_API_KEY,
      apiSecretKey: process.env.SHOPIFY_API_SECRET,
      scopes: process.env.SCOPES.split(","),
      hostName: process.env.SHOPIFY_APP_URL.replace(/^https:\/\//, ""),
      apiVersion: LATEST_API_VERSION,
      isEmbeddedApp: true,
    });

    const admin = new client.clients.Graphql({ session });

    if (!handle || !newUrl || !customerEmail) {
      return data({ error: "Missing required fields" }, { status: 400 });
    }

    const lookupResponse = await admin.graphql(
      `#graphql
        query GetMetaobjectByHandle($handle: MetaobjectHandleInput!) {
          metaobjectByHandle(handle: $handle) {
            id
            fields {
              key
              value
            }
          }
        }
      `,
      {
        variables: {
          handle: {
            type: "customer_qr_links",
            handle,
          },
        },
      }
    );

    const lookupJson = await lookupResponse.json();
    const metaobject = lookupJson?.data?.metaobjectByHandle;

    if (!metaobject) {
      return data({ error: "QR link not found" }, { status: 404 });
    }

    const fieldMap = Object.fromEntries(
      metaobject.fields.map((f) => [f.key, f.value])
    );

    if (
      fieldMap.customer_email &&
      fieldMap.customer_email.toLowerCase() !== customerEmail.toLowerCase()
    ) {
      return data({ error: "Unauthorized update attempt" }, { status: 403 });
    }

    const updateResponse = await admin.graphql(
      `#graphql
        mutation UpdateMetaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) {
          metaobjectUpdate(id: $id, metaobject: $metaobject) {
            metaobject { id }
            userErrors { field message }
          }
        }
      `,
      {
        variables: {
          id: metaobject.id,
          metaobject: {
            fields: [
              {
                key: "qr_target_url",
                value: newUrl,
              },
            ],
          },
        },
      }
    );

    const updateJson = await updateResponse.json();

    if (updateJson.data.metaobjectUpdate.userErrors.length > 0) {
      return data(
        { error: updateJson.data.metaobjectUpdate.userErrors[0].message },
        { status: 400 }
      );
    }

    return data({ success: true });
  } catch (error) {
    console.error("QR update error:", error);
    return data({ error: "Server error" }, { status: 500 });
  }
}