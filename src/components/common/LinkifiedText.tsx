import Linkify from 'linkify-react';

const HAS_SCHEME = /^[a-z][a-z\d+.-]*:/i;

/**
 * Decides which URLs linkify-react turns into links. It only links http(s) URLs,
 * `www.` hosts, and bare hosts with a path (e.g. `cad.onshape.com/documents/...`).
 * A bare "file name" like `bracket.zip` or `part.mov` stays plain text, even
 * though .zip and .mov are real TLDs. Any other scheme is never linked.
 */
function isLinkableUrl(value: string) {
  if (HAS_SCHEME.test(value)) return /^https?:\/\//i.test(value);
  return /^www\./i.test(value) || value.includes('/');
}

const LINKIFY_OPTIONS = {
  defaultProtocol: 'https',
  target: '_blank',
  rel: 'noopener noreferrer',
  validate: { url: isLinkableUrl, email: false },
};

/** Renders plain text with any URLs in it as links that open in a new tab. */
export default function LinkifiedText({ children }: { children: string }) {
  return <Linkify options={LINKIFY_OPTIONS}>{children}</Linkify>;
}
