import { data } from "react-router";
import shopify from "../shopify.server";

const PLACEHOLDER_TARGET_URL = "https://explore.homes/pages/coming-soon";
const METAOBJECT_TYPE = "customer_qr_links";

function getPropertyValue(properties = [], targetName) {
  const match = properties.find((prop) => prop?.name === targetName);
  return String(match?.value || "").trim();
}

function normalizeQrId(qrId) {
  return String(qrId || "").replace(/-/g, "").trim().toUpperCase();
}

function buildCustomerGid(customerId) {
  if (!customerId) return null;
  return `gid://shopify/Customer/${customerId}`;
}

async function findExistingRedirect(admin, redirectPath) {
  const response = await admin.graphql(
    `#graphql
      query FindRedirect($query: String!) {
        urlRedirects(first: 1, query: $query) {
          nodes {
            id
            path
            target
          }
        }
      }
    `,
    {
      variables: {
        query: `path:${redirectPath}`,
      },
    }
  );

  const json = await response.json();
  return json?.data?.urlRedirects?.nodes?.[0] || null;
}

async function createOrUpdateRedirect(admin, redirectPath, targetUrl) {
  const existingRedirect = await findExistingRedirect(admin, redirectPath);

  if (existingRedirect?.id) {
    const updateResponse = await admin.graphql(
      `#graphql
        mutation UpdateRedirect($id: ID!, $urlRedirect: UrlRedirectInput!) {
          urlRedirectUpdate(id: $id, urlRedirect: $urlRedirect) {
            urlRedirect {
              id
              path
              target
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
          id: existingRedirect.id,
          urlRedirect: {
            path: redirectPath,
            target: targetUrl,
          },
        },
      }
    );

    const updateJson = await updateResponse.json();
    const errors = updateJson?.data?.urlRedirectUpdate?.userErrors || [];

    if (errors.length > 0) {
      throw new Error(errors[0].message || "Redirect update failed.");
    }

    return updateJson?.data?.urlRedirectUpdate?.urlRedirect;
  }

  const createResponse = await admin.graphql(
    `#graphql
      mutation CreateRedirect($urlRedirect: UrlRedirectInput!) {
        urlRedirectCreate(urlRedirect: $urlRedirect) {
          urlRedirect {
            id
            path
            target
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
        urlRedirect: {
          path: redirectPath,
          target: targetUrl,
        },
      },
    }
  );

  const createJson = await createResponse.json();
  const errors = createJson?.data?.urlRedirectCreate?.userErrors || [];

  if (errors.length > 0) {
    throw new Error(errors[0].message || "Redirect creation failed.");
  }

  return createJson?.data?.urlRedirectCreate?.urlRedirect;
}

async function createCustomerQrMetaobject({
  admin,
  qrId,
  qrLink,
  customerId,
  customerEmail,
  orderName,
}) {
  const redirectPath = `/qr/${qrId}`;

  // IMPORTANT:
  // These field keys must exactly match your Shopify metaobject field keys.
  // Update these keys if your definition uses different keys.
  const fields = [
    { key: "qr_id", value: qrId },
    { key: "qr_redirect_path", value: redirectPath },
    { key: "qr_public_url", value: qrLink },
    { key: "qr_target_url", value: PLACEHOLDER_TARGET_URL },
    { key: "status", value: "pending" },
  ];

  if (customerEmail) {
    fields.push({ key: "customer_email", value: customerEmail });
  }

  if (customerId) {
    fields.push({ key: "customer_reference", value: buildCustomerGid(customerId) });
  }

  if (orderName) {
    fields.push({ key: "order_reference", value: orderName });
  }

  const response = await admin.graphql(
    `#graphql
      mutation CreateMetaobject($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject {
            id
            handle
            type
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
        metaobject: {
          type: METAOBJECT_TYPE,
          fields,
        },
      },
    }
  );

  const json = await response.json();
  const errors = json?.data?.metaobjectCreate?.userErrors || [];

  if (errors.length > 0) {
    throw new Error(errors[0].message || "Metaobject creation failed.");
  }

  return json?.data?.metaobjectCreate?.metaobject;
}

export async function action({ request }) {
  try {
    const { topic, shop, payload, admin } = await shopify.authenticate.webhook(request);

    if (topic !== "ORDERS_CREATE") {
      return data({ ok: true, ignored: true });
    }

    const order = payload;
    const lineItems = order?.line_items || [];
    const customerId = order?.customer?.id ? String(order.customer.id) : "";
    const customerEmail = String(order?.email || order?.customer?.email || "").trim().toLowerCase();
    const orderName = String(order?.name || "").trim();

    for (const item of lineItems) {
      const properties = item?.properties || [];

      const qrRawId = normalizeQrId(getPropertyValue(properties, "qr_raw_id"));
      const qrLink = getPropertyValue(properties, "qr_link");

      if (!qrRawId || !qrLink) {
        continue;
      }

      const redirectPath = `/qr/${qrRawId}`;

      await createOrUpdateRedirect(admin, redirectPath, PLACEHOLDER_TARGET_URL);

      await createCustomerQrMetaobject({
        admin,
        qrId: qrRawId,
        qrLink,
        customerId,
        customerEmail,
        orderName,
      });

      console.log(`Created QR setup for order ${orderName}: ${qrRawId} (${shop})`);
    }

    return data({ ok: true });
  } catch (error) {
    console.error("orders/create webhook error:", error);
    return data({ ok: false, error: error?.message || "Webhook failed" }, { status: 500 });
  }
}