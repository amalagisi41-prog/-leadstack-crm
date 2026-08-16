import { describe, expect, it } from "vitest";
import {
  assessEmailRisk,
  classifyRecord,
  emailSurvivedCutover,
  formatRecordForCopy,
  identifyDnsHost,
  nameserversMatch,
  recordsToPreserve,
  resolveTargetNameservers,
  type DnsRecordSnapshot,
  type DomainDnsSnapshot,
} from "./records";

/**
 * The outage these guard against: an agent moves nameservers to a new host
 * having copied only their website records, and email stops arriving. It
 * fails silently — no error, no bounce they ever see — and is usually noticed
 * days later by a client who never got a reply.
 */

const snapshot = (records: DnsRecordSnapshot[], nameservers: string[] = []):
  DomainDnsSnapshot => ({
  domain: "example-realty.test",
  nameservers,
  records,
  checkedAt: "2026-08-16T12:00:00Z",
});

const MX: DnsRecordSnapshot = {
  kind: "MX",
  name: "@",
  value: "aspmx.l.google.com",
  priority: 1,
};
const SPF: DnsRecordSnapshot = {
  kind: "TXT",
  name: "@",
  value: "v=spf1 include:_spf.google.com ~all",
};
const DKIM: DnsRecordSnapshot = {
  kind: "TXT",
  name: "google._domainkey",
  value: "v=DKIM1; k=rsa; p=MIGf...",
};
const DMARC: DnsRecordSnapshot = {
  kind: "TXT",
  name: "_dmarc",
  value: "v=DMARC1; p=none;",
};
const WEBSITE_A: DnsRecordSnapshot = {
  kind: "A",
  name: "@",
  value: "162.159.140.166",
};

describe("classifying what a record is for", () => {
  it("treats every flavour of mail record as email", () => {
    expect(classifyRecord(MX)).toBe("email");
    expect(classifyRecord(SPF)).toBe("email");
    expect(classifyRecord(DKIM)).toBe("email");
    expect(classifyRecord(DMARC)).toBe("email");
  });

  it("treats address records as website", () => {
    expect(classifyRecord(WEBSITE_A)).toBe("website");
    expect(
      classifyRecord({ kind: "CNAME", name: "www", value: "vibe.ludicrous.cloud" })
    ).toBe("website");
  });

  it("keeps third-party verification records separate", () => {
    expect(
      classifyRecord({
        kind: "TXT",
        name: "@",
        value: "google-site-verification=abc123",
      })
    ).toBe("verification");
  });
});

describe("warning before the nameservers move", () => {
  it("says plainly that email will break, and counts the records", () => {
    const risk = assessEmailRisk(snapshot([MX, SPF, DKIM, WEBSITE_A]));

    expect(risk.hasEmail).toBe(true);
    expect(risk.mxCount).toBe(1);
    expect(risk.authCount).toBe(2);
    expect(risk.warning).toMatch(/email will stop arriving/i);
  });

  it("stays quiet when the domain has no mail at all", () => {
    const risk = assessEmailRisk(snapshot([WEBSITE_A]));
    expect(risk.hasEmail).toBe(false);
    expect(risk.warning).toBeNull();
  });

  it("handles a domain we could not read", () => {
    expect(assessEmailRisk(null).warning).toBeNull();
  });
});

describe("what has to be copied across", () => {
  it("lists email records first, then verification", () => {
    const preserve = recordsToPreserve(
      snapshot([
        WEBSITE_A,
        { kind: "TXT", name: "@", value: "google-site-verification=abc" },
        MX,
        SPF,
      ])
    );

    expect(preserve.map((r) => r.kind)).toEqual(["MX", "TXT", "TXT"]);
    expect(classifyRecord(preserve[0])).toBe("email");
    // Website records are excluded — they are replaced, not preserved.
    expect(preserve.some((r) => r.kind === "A")).toBe(false);
  });

  it("formats a row the way a DNS panel expects it", () => {
    expect(formatRecordForCopy(MX)).toBe("MX\t@\t1\taspmx.l.google.com");
    expect(formatRecordForCopy(SPF)).toBe(
      "TXT\t@\tv=spf1 include:_spf.google.com ~all"
    );
  });
});

describe("naming the panel the agent has to open", () => {
  it("recognises common DNS hosts from their nameservers", () => {
    expect(identifyDnsHost(["kim.ns.cloudflare.com"]).id).toBe("cloudflare");
    expect(identifyDnsHost(["ns01.domaincontrol.com"]).label).toBe("GoDaddy");
    expect(identifyDnsHost(["dns1.registrar-servers.com"]).id).toBe("namecheap");
    expect(identifyDnsHost(["ns1.leadconnectorhq.com"]).id).toBe("gohighlevel");
  });

  it("falls back to a generic phrase rather than guessing wrong", () => {
    const guess = identifyDnsHost(["ns1.some-tiny-host.example"]);
    expect(guess.id).toBeNull();
    expect(guess.label).toBe("your current DNS provider");
    expect(guess.url).toBeNull();
  });

  it("tolerates trailing dots and casing from the resolver", () => {
    expect(identifyDnsHost(["KIM.NS.CLOUDFLARE.COM."]).id).toBe("cloudflare");
  });
});

describe("confirming the switch happened", () => {
  it("matches regardless of order, case, or trailing dots", () => {
    expect(
      nameserversMatch(
        ["KIM.ns.cloudflare.com.", "walt.ns.cloudflare.com"],
        ["walt.ns.cloudflare.com", "kim.ns.cloudflare.com"]
      )
    ).toBe(true);
  });

  it("does not match while the old nameservers are still live", () => {
    expect(
      nameserversMatch(
        ["ns01.domaincontrol.com"],
        ["kim.ns.cloudflare.com", "walt.ns.cloudflare.com"]
      )
    ).toBe(false);
  });

  it("never reports a match on empty input", () => {
    expect(nameserversMatch([], ["kim.ns.cloudflare.com"])).toBe(false);
    expect(nameserversMatch(["kim.ns.cloudflare.com"], [])).toBe(false);
  });
});

describe("catching an outage after the switch", () => {
  it("raises the alarm when mail records did not come across", () => {
    const result = emailSurvivedCutover(
      snapshot([MX, SPF]),
      snapshot([WEBSITE_A])
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not being delivered/i);
  });

  it("flags lost anti-spam records even when mail still flows", () => {
    const result = emailSurvivedCutover(
      snapshot([MX, SPF, DKIM]),
      snapshot([MX])
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/spam/i);
  });

  it("confirms a clean move", () => {
    const result = emailSurvivedCutover(
      snapshot([MX, SPF]),
      snapshot([MX, SPF, WEBSITE_A])
    );
    expect(result.ok).toBe(true);
  });

  it("stays silent for a domain that never had email", () => {
    const result = emailSurvivedCutover(
      snapshot([WEBSITE_A]),
      snapshot([WEBSITE_A])
    );
    expect(result.ok).toBe(true);
    expect(result.message).toBeNull();
  });
});

describe("the nameservers a deployment hands out", () => {
  /**
   * This is the single most dangerous string in the product. A nameserver
   * pair answers only for the zones inside the account it was issued to, so
   * pointing an agent's domain at a pair that has no zone for it removes the
   * domain from DNS altogether — site down, mail down, and no error anywhere
   * to explain it. A default is therefore not a convenience, it is an outage
   * waiting for the first deployment that forgets to override it.
   */
  it("resolves to nothing when unset", () => {
    expect(resolveTargetNameservers(undefined)).toEqual([]);
    expect(resolveTargetNameservers(null)).toEqual([]);
    expect(resolveTargetNameservers("")).toEqual([]);
    expect(resolveTargetNameservers("   ")).toEqual([]);
  });

  it("accepts a properly configured pair", () => {
    expect(
      resolveTargetNameservers("ns1.example-dns.com, ns2.example-dns.com")
    ).toEqual(["ns1.example-dns.com", "ns2.example-dns.com"]);
  });

  it("normalises case and the trailing root dot", () => {
    expect(
      resolveTargetNameservers("NS1.Example-DNS.com.,ns2.example-dns.com.")
    ).toEqual(["ns1.example-dns.com", "ns2.example-dns.com"]);
  });

  it("treats a lone nameserver as unset rather than a configuration", () => {
    // One entry is a truncated paste, and half a pair is not a working
    // delegation — better to fall back to the record-only path.
    expect(resolveTargetNameservers("ns1.example-dns.com")).toEqual([]);
    expect(
      resolveTargetNameservers("ns1.example-dns.com,ns1.example-dns.com")
    ).toEqual([]);
  });

  it("discards anything that is not a bare hostname", () => {
    expect(
      resolveTargetNameservers("https://ns1.example.com,ns2.example.com")
    ).toEqual([]);
    expect(
      resolveTargetNameservers("ns1.example.com/path,ns2.example.com")
    ).toEqual([]);
    expect(resolveTargetNameservers("localhost,ns2.example.com")).toEqual([]);
    expect(resolveTargetNameservers("ns 1.example.com,ns2.example.com")).toEqual(
      []
    );
  });

  it("never invents Cloudflare's shared pair", () => {
    // The literal that used to be the fallback. It belongs to one Cloudflare
    // account; every agent following it would have been delegating their
    // domain to a zone that does not exist.
    for (const input of [undefined, null, "", "  ,  "]) {
      expect(resolveTargetNameservers(input)).not.toContain(
        "kim.ns.cloudflare.com"
      );
    }
  });

  it("produces a value nameserversMatch can actually confirm against", () => {
    const target = resolveTargetNameservers("ns1.example-dns.com,ns2.example-dns.com");
    expect(nameserversMatch(["NS1.example-dns.com.", "ns2.example-dns.com"], target)).toBe(
      true
    );
    // And an unset deployment can never report a match, so the cutover step
    // cannot mark itself complete by accident.
    expect(nameserversMatch(["ns1.example-dns.com"], resolveTargetNameservers(""))).toBe(
      false
    );
  });
});
