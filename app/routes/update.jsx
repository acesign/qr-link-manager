import { data } from "react-router";
import shopify from "../shopify.server";

export async function action({ request }) {
  try {
    const proxyContext = await shopify.authenticate.public.appProxy(request);
    const url = new URL(request.url);

    const shop =
      proxyContext?.shop ||
      url.searchParams.get("shop") ||
      url.searchParams.get("logged_in_customer_shop_domain");

    if (!shop) {
      return data({ error: "Missing shop context" }, { status: 400 });
    }

    const { admin } = await shopify.unauthenticated.admin(shop);

    const formData = await request.formData();
    const handle = String(formData.get("metaobject_handle") || "").trim();
    const newUrl = String(formData.get("qr_target_url") || "").trim();
    const customerEmail = String(formData.get("customer_email") || "").trim().toLowerCase();

    if (!handle || !newUrl || !customerEmail) {
      return data({ error: "Missing required fields" }, { status: 400 });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(newUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch {
      return data({ error: "Please enter a valid URL." }, { status: 400 });
    }

    const lookupResponse = await admin.graphql(
      `#graphql
        query GetMetaobjectByHandle($handle: MetaobjectHandleInput!) {
          metaobjectByHandle(handle: $handle) {
            id
            handle
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
      (metaobject.fields || []).map((f) => [f.key, f.value])
    );

    const ownerEmail = String(fieldMap.customer_email || "").trim().toLowerCase();
    if (!ownerEmail || ownerEmail !== customerEmail) {
      return data({ error: "Unauthorized update attempt" }, { status: 403 });
    }

    const updateResponse = await admin.graphql(
      `#graphql
        mutation UpdateMetaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) {
          metaobjectUpdate(id: $id, metaobject: $metaobject) {
            metaobject {
              id
              handle
            }
            userErrors {
              field
              message
            }
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
                value: parsedUrl.toString(),
              },
            ],
          },
        },
      }
    );

    const updateJson = await updateResponse.json();
    const userErrors = updateJson?.data?.metaobjectUpdate?.userErrors || [];

    if (userErrors.length > 0) {
      return data(
        { error: userErrors[0].message || "Update failed." },
        { status: 400 }
      );
    }

    return data({ success: true });
  } catch (error) {
    console.error("QR update error:", error);
    return data(
      { error: error?.message || "Unexpected server error" },
      { status: 500 }
    );
  }
}