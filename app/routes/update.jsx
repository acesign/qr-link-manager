import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  try {
    const { admin } = await authenticate.public.appProxy(request);

    const formData = await request.formData();
    const handle = String(formData.get("metaobject_handle") || "").trim();
    const newUrl = String(formData.get("qr_target_url") || "").trim();
    const customerEmail = String(formData.get("customer_email") || "").trim().toLowerCase();

    if (!handle || !newUrl || !customerEmail) {
      return json({ success: false, error: "Missing required fields." }, { status: 400 });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(newUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch {
      return json({ success: false, error: "Please enter a valid URL." }, { status: 400 });
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
      return json({ success: false, error: "QR link not found." }, { status: 404 });
    }

    const fieldMap = Object.fromEntries(
      (metaobject.fields || []).map((field) => [field.key, field.value])
    );

    const ownerEmail = String(fieldMap.customer_email || "").trim().toLowerCase();
    if (!ownerEmail || ownerEmail !== customerEmail) {
      return json({ success: false, error: "You are not allowed to update this QR link." }, { status: 403 });
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
      return json({ success: false, error: userErrors[0].message || "Update failed." }, { status: 400 });
    }

    return json({ success: true });
  } catch (error) {
    console.error("QR update route error:", error);
    return json(
      { success: false, error: error?.message || "Unexpected server error" },
      { status: 400 }
    );
  }
}