import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Panel } from "@/components/ui/Panel";
import { MetricChip } from "@/components/ui/MetricChip";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { StatusChip } from "@/components/ui/StatusChip";

describe("Panel", () => {
  it("renders title and children", () => {
    render(<Panel title="Test" badge="3"><p>content</p></Panel>);
    expect(screen.getByText("Test")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("content")).toBeDefined();
  });
});

describe("MetricChip", () => {
  it("renders label and value", () => {
    render(<MetricChip label="Uplink" value="Nominal" />);
    expect(screen.getByText("Uplink")).toBeDefined();
    expect(screen.getByText("Nominal")).toBeDefined();
  });
});

describe("RiskBadge", () => {
  it("renders risk text with correct styling class", () => {
    const { container } = render(<RiskBadge risk="CRITICAL" />);
    expect(screen.getByText("CRITICAL")).toBeDefined();
    expect(container.querySelector(".text-eve-danger")).not.toBeNull();
  });

  it("maps severity number to risk level", () => {
    render(<RiskBadge severity={9} />);
    expect(screen.getByText("CRITICAL")).toBeDefined();
  });
});

describe("StatusChip", () => {
  it("renders label with active state", () => {
    render(<StatusChip label="LIVE" active />);
    expect(screen.getByText("LIVE")).toBeDefined();
  });
});
