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

export type AttractorDebugUpdateInput = Readonly<{
  settings: Pick<MurmurationSettings, "attractorDebug">;
  center: Vec3;
  radius: number;
}>;

const markerColor: ColorRepresentation = "#e34234";
const radiusColor: ColorRepresentation = "#d24b3a";

export class AttractorDebugOverlay {
  public readonly group = new Group();

  private readonly radiusGeometry = new SphereGeometry(1, 36, 18);

  private readonly wireGeometry = new WireframeGeometry(this.radiusGeometry);

  private readonly markerGeometry = new SphereGeometry(1, 16, 10);

  private readonly spokeGeometry = new BufferGeometry();

  private readonly spokePositions = new Float32Array(6);

  private readonly radiusMaterial = new LineBasicMaterial({
    color: radiusColor,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    depthTest: false,
  });

  private readonly spokeMaterial = new LineBasicMaterial({
    color: radiusColor,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    depthTest: false,
  });

  private readonly markerMaterial = new MeshBasicMaterial({
    color: markerColor,
    transparent: true,
    opacity: 0.95,
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
    this.group.name = "AttractorDebugOverlay";
    this.group.renderOrder = 100;
    this.radiusSphere.renderOrder = 100;
    this.spoke.renderOrder = 101;
    this.marker.renderOrder = 102;
    this.group.add(this.radiusSphere, this.spoke, this.marker);
    this.group.visible = false;
  }

  public update = ({
    settings,
    center,
    radius,
  }: AttractorDebugUpdateInput): void => {
    const visible = settings.attractorDebug && radius > 0;
    this.group.visible = visible;

    if (!visible) {
      return;
    }

    this.radiusSphere.scale.setScalar(radius);
    this.marker.position.set(center[0], center[1], center[2]);
    this.marker.scale.setScalar(Math.max(0.09, radius * 0.06));

    this.spokePositions.set([0, 0, 0, center[0], center[1], center[2]]);
    const position = this.spokeGeometry.getAttribute("position");
    position.needsUpdate = true;
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
