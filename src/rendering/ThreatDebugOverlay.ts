import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  WireframeGeometry,
  type ColorRepresentation,
} from "three";
import type { MurmurationSettings } from "../app/settings";
import type { Vec3 } from "../math/vec3";

export type ThreatDebugUpdateInput = Readonly<{
  settings: Pick<MurmurationSettings, "threatDebug">;
  position: Vec3 | null;
  radius: number;
}>;

const markerColor: ColorRepresentation = "#12b8ff";
const radiusColor: ColorRepresentation = "#178ee8";

export class ThreatDebugOverlay {
  public readonly group = new Group();

  private readonly radiusGeometry = new SphereGeometry(1, 36, 18);

  private readonly wireGeometry = new WireframeGeometry(this.radiusGeometry);

  private readonly markerGeometry = new SphereGeometry(1, 16, 10);

  private readonly spokeGeometry = new BufferGeometry();

  private readonly spokePositions = new Float32Array(6);

  private readonly radiusMaterial = new LineBasicMaterial({
    color: radiusColor,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    depthTest: false,
  });

  private readonly spokeMaterial = new LineBasicMaterial({
    color: radiusColor,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    depthTest: false,
  });

  private readonly markerMaterial = new MeshBasicMaterial({
    color: markerColor,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
    depthTest: false,
  });

  private readonly radiusSphere = new LineSegments(
    this.wireGeometry,
    this.radiusMaterial,
  );

  private readonly spoke = new Line(this.spokeGeometry, this.spokeMaterial);

  private readonly marker = new Mesh(this.markerGeometry, this.markerMaterial);

  public constructor() {
    this.spokeGeometry.setAttribute(
      "position",
      new BufferAttribute(this.spokePositions, 3),
    );
    this.group.name = "ThreatDebugOverlay";
    this.group.renderOrder = 110;
    this.radiusSphere.renderOrder = 110;
    this.spoke.renderOrder = 111;
    this.marker.renderOrder = 112;
    this.group.add(this.radiusSphere, this.spoke, this.marker);
    this.group.visible = false;
  }

  public update = ({
    settings,
    position,
    radius,
  }: ThreatDebugUpdateInput): void => {
    const visible = settings.threatDebug && position !== null && radius > 0;
    this.group.visible = visible;

    if (!visible || position === null) {
      return;
    }

    this.radiusSphere.position.set(position[0], position[1], position[2]);
    this.radiusSphere.scale.setScalar(radius);
    this.marker.position.set(position[0], position[1], position[2]);
    this.marker.scale.setScalar(Math.max(0.055, radius * 0.18));

    this.spokePositions.set([0, 0, 0, position[0], position[1], position[2]]);
    const attribute = this.spokeGeometry.getAttribute("position");
    attribute.needsUpdate = true;
  };

  public dispose = (): void => {
    this.group.remove(this.radiusSphere, this.spoke, this.marker);
    this.wireGeometry.dispose();
    this.radiusGeometry.dispose();
    this.markerGeometry.dispose();
    this.spokeGeometry.dispose();
    this.radiusMaterial.dispose();
    this.spokeMaterial.dispose();
    this.markerMaterial.dispose();
  };
}
