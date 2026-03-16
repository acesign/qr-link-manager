import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export async function action({ request }) {

  const { admin } = await authenticate.public.appProxy(request);

  const formData = await request.formData();

  const handle = formData.get("metaobject_handle");
  const newUrl = formData.get("qr_target_url");

  const mutation = `
    mutation updateMetaobject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpdateInput!) {
      metaobjectUpdate(handle: $handle, metaobject: $metaobject) {
        metaobject {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await admin.graphql(mutation, {
    variables: {
      handle: {
        type: "customer_qr_links",
        handle: handle
      },
      metaobject: {
        fields: [
          {
            key: "qr_target_url",
            value: newUrl
          }
        ]
      }
    }
  });

  return json({ success: true });
}