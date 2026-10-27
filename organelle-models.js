/**
 * 细胞器的程序化几何模型。
 * 单位是演示坐标，不代表实际微米或纳米；剖面用于展示内部结构。
 * 每个工厂函数独立设置随机种子，因此首页和介绍页生成同一个模型。
 * 交互、灯光和相机在 spatial.js；此文件只负责建模。
 */
window.createCellModels = function (T, { detail = false } = {}) {
  const TAU = Math.PI * 2;
  const SEGMENTS = detail ? 64 : 40;
  let seed = 1;

  function random() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  function material(color, options = {}) {
    return new T.MeshStandardMaterial({
      color,
      roughness: 0.48,
      metalness: 0.035,
      side: T.DoubleSide,
      ...options,
    });
  }

  function add(group, geometry, color, name, position = [0, 0, 0], options = {}) {
    const object = new T.Mesh(geometry, material(color, options));
    object.name = name;
    object.position.set(...position);
    object.castShadow = true;
    object.receiveShadow = true;
    group.add(object);
    return object;
  }

  // 参数曲面：用于连续膜面、膜褶皱与封闭的扁平囊。
  function surface(nu, nv, point, omit = () => false) {
    const vertices = [],
      indices = [];
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) vertices.push(...point(i / nu, j / nv));
    }
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        if (omit((i + 0.5) / nu, (j + 0.5) / nv)) continue;
        const a = i * (nv + 1) + j,
          b = a + nv + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function tube(group, points, radius, color, name, closed = false) {
    const curve = new T.CatmullRomCurve3(
      points.map((p) => new T.Vector3(...p)),
      closed,
    );
    const geometry = new T.TubeGeometry(
      curve,
      Math.min(180, Math.max(24, points.length * 3)),
      radius,
      8,
      closed,
    );
    return add(group, geometry, color, name);
  }

  function sphere(group, position, size, color, name, bumpy = 0) {
    const geometry = new T.SphereGeometry(1, detail ? 32 : 20, detail ? 24 : 14);
    if (bumpy) {
      const p = geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          y = p.getY(i),
          z = p.getZ(i);
        const f =
          1 +
          bumpy *
            (Math.sin(x * 9 + z * 4) * Math.sin(y * 8 - z * 3) + 0.4 * Math.cos(z * 13 + y * 7));
        p.setXYZ(i, x * f, y * f, z * f);
      }
      geometry.computeVertexNormals();
    }
    const object = add(group, geometry, color, name, position);
    object.scale.set(...(Array.isArray(size) ? size : [size, size, size]));
    return object;
  }

  function annotate(group, items) {
    group.userData.anatomy = items.map(([label, color]) => ({ label, color }));
    return group;
  }

  function cutEdge(group, point, color, name, radius = 0.018) {
    for (const edge of [0, 1]) {
      const points = Array.from({ length: 65 }, (_, i) => point(i / 64, edge));
      tube(group, points, radius, color, name);
    }
  }

  function nucleus() {
    seed = 101;
    const group = new T.Group();
    const pores = [];
    // 同一组孔洞穿过内外核膜；核孔复合体位于通道边缘。
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        const theta = 0.48 + row * 0.65;
        const phi = 2.4 + col * 0.64 + (row % 2) * 0.1;
        pores.push(
          new T.Vector3(
            -Math.cos(phi) * Math.sin(theta),
            Math.cos(theta),
            Math.sin(phi) * Math.sin(theta),
          ),
        );
      }
    }
    function direction(u, v) {
      const theta = u * Math.PI,
        phi = 2.2 + v * 4.52;
      return [-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)];
    }
    const omit = (u, v) => {
      const p = new T.Vector3(...direction(u, v));
      return pores.some((n) => n.dot(p) > 0.997);
    };
    for (const [r, color, name] of [
      [1.23, '#9a79bd', '外核膜'],
      [1.13, '#c29bd5', '内核膜'],
    ]) {
      const point = (u, v) => direction(u, v).map((c) => c * r);
      add(group, surface(detail ? 100 : 72, detail ? 160 : 112, point, omit), color, name);
      cutEdge(group, point, color, name + '剖切边缘', 0.015);
    }
    for (const normal of pores) {
      const ring = add(group, new T.TorusGeometry(0.082, 0.024, 8, 16), '#e5cfeb', '核孔复合体');
      ring.position.copy(normal.clone().multiplyScalar(1.235));
      ring.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), normal);
      const channel = add(
        group,
        new T.CylinderGeometry(0.058, 0.058, 0.1, 12, 1, true),
        '#d3b4df',
        '核孔通道',
      );
      channel.position.copy(normal.clone().multiplyScalar(1.18));
      channel.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), normal);
    }
    sphere(group, [0.18, -0.1, 0.15], [0.39, 0.35, 0.36], '#ce7dba', '核仁', 0.08);
    // 染色质使用不规则曲线，避免出现绕核仁运行的行星轨道形象。
    for (let k = 0; k < 7; k++) {
      const points = [];
      let point = new T.Vector3(Math.cos(k) * 0.75, Math.sin(k * 2) * 0.45, Math.sin(k) * 0.75);
      const nucleolus = new T.Vector3(0.18, -0.1, 0.15);
      for (let j = 0; j < 52; j++) {
        point = point
          .clone()
          .multiplyScalar(0.94)
          .add(
            new T.Vector3(
              (random() - 0.5) * 0.48,
              (random() - 0.5) * 0.48,
              (random() - 0.5) * 0.48,
            ),
          );
        const offset = point.clone().sub(nucleolus);
        if (offset.length() < 0.46)
          point.copy(nucleolus).add(offset.normalize().multiplyScalar(0.46));
        if (point.length() > 1.02) point.normalize().multiplyScalar(1.02);
        points.push(point.toArray());
      }
      tube(group, points, 0.018, k % 2 ? '#a587c4' : '#e1bfdc', '染色质');
    }
    return annotate(group, [
      ['双层核膜', '#b294ce'],
      ['核孔复合体', '#e5cfeb'],
      ['染色质', '#e1bfdc'],
      ['核仁', '#ce7dba'],
    ]);
  }

  function mitochondrion() {
    seed = 202;
    const group = new T.Group();
    // 长轴为 X；切除朝向观察者的一块膜，以展示膜间隙与基质。
    // 两层膜各自是独立连续曲面，内膜的嵴与内边界膜连续相接。
    const startAngle = 1.78,
      angleLength = 4.18;
    const crests = [-1.04, -0.7, -0.36, 0, 0.36, 0.7, 1.04];
    function point(u, v, inner) {
      const x = (u * 2 - 1) * (inner ? 1.46 : 1.59);
      const a = startAngle + v * angleLength;
      const envelope = Math.sqrt(Math.max(0, 1 - (u * 2 - 1) ** 2));
      let fold = 0;
      if (inner) {
        // 窄而深的膜内折产生两片相邻膜面，之间为嵴腔；不是独立的管或柱。
        for (const center of crests) {
          const delta = (x - center - 0.025 * Math.sin(a * 3 + center)) / 0.055;
          fold = Math.max(fold, Math.exp(-delta * delta));
        }
      }
      const depth = 0.7 * fold * (0.72 + 0.28 * Math.sin(v * Math.PI));
      const radial = envelope * (1 - depth);
      return [
        x,
        Math.cos(a) * radial * (inner ? 0.59 : 0.72),
        Math.sin(a) * radial * (inner ? 0.72 : 0.85) + 0.12 * envelope ** 2,
      ];
    }
    const outer = (u, v) => point(u, v, false);
    const inner = (u, v) => point(u, v, true);
    add(group, surface(72, SEGMENTS, outer), '#b86f50', '外膜');
    cutEdge(group, outer, '#f1b087', '外膜剖切边缘', 0.022);
    add(group, surface(detail ? 360 : 240, SEGMENTS, inner), '#e5aa69', '连续内膜与片状嵴');
    // 嵴的剖面轮廓由同一函数采样，使接缝与实际膜几何一致。
    for (const edge of [0, 1]) {
      const points = Array.from({ length: 241 }, (_, i) => inner(i / 240, edge));
      tube(group, points, 0.012, '#ffe0a0', '内膜及嵴剖切边缘');
    }
    const dna = Array.from({ length: 48 }, (_, i) => {
      const a = (i / 48) * TAU;
      return [0.55 + 0.19 * Math.cos(a), -0.16 + 0.04 * Math.sin(a * 3), 0.36 + 0.11 * Math.sin(a)];
    });
    tube(group, dna, 0.012, '#f4e6b6', '线粒体DNA示意', true);
    for (let i = 0; i < 15; i++) {
      const x = -1.1 + random() * 2.2;
      const r = Math.sqrt(1 - (x / 1.46) ** 2);
      sphere(
        group,
        [x, -0.16 + random() * 0.22, 0.24 * r + random() * 0.1],
        0.024,
        '#e2ce9a',
        '基质中的线粒体核糖体示意',
      );
    }
    return annotate(group, [
      ['外膜', '#b86f50'],
      ['内膜及片状嵴', '#e5aa69'],
      ['膜间隙 / 嵴腔', '#553c32'],
      ['基质区域与 DNA', '#f4e6b6'],
    ]);
  }

  // 扁平囊是一个闭合的薄壳；上下膜面之间留出囊腔。
  function cisterna(group, { y, width, depth, bend, color, name, phase = 0 }) {
    function point(u, v) {
      const theta = u * Math.PI,
        phi = v * TAU;
      const radial = Math.sin(theta);
      const x = Math.cos(phi) * radial * width;
      const z = Math.sin(phi) * radial * depth;
      const ripple = 0.035 * Math.sin(x * 4 + phase) * Math.cos(z * 4);
      return [x, y + 0.065 * Math.cos(theta) + bend * (x / width) ** 2 + ripple, z];
    }
    const object = add(group, surface(20, SEGMENTS, point), color, name);
    const rim = Array.from({ length: 65 }, (_, i) => point(0.5, i / 64));
    tube(group, rim, 0.035, color, name + '膨大的边缘');
    return object;
  }

  function er() {
    seed = 303;
    const group = new T.Group();
    for (let layer = 0; layer < 4; layer++) {
      const y = -0.28 + layer * 0.24;
      const width = 1.08 - layer * 0.07;
      cisterna(group, {
        y,
        width,
        depth: 0.61,
        bend: 0.18,
        color: '#8d8ab9',
        name: '粗面内质网扁平囊',
        phase: layer,
      });
      for (let n = 0; n < 24; n++) {
        const a = random() * TAU,
          r = Math.sqrt(random()) * 0.86;
        const x = Math.cos(a) * r * width,
          z = Math.sin(a) * r * 0.61;
        const top =
          y +
          0.065 * Math.sqrt(1 - r * r) +
          0.18 * (x / width) ** 2 +
          0.035 * Math.sin(x * 4 + layer) * Math.cos(z * 4);
        sphere(
          group,
          [x, top + 0.038, z],
          [0.038, 0.029, 0.035],
          '#dac7e9',
          '附着在胞质侧的核糖体',
        );
      }
      if (layer < 3)
        tube(
          group,
          [
            [-0.78, y + 0.1, -0.2],
            [-0.98, y + 0.2, -0.23],
            [-0.76, y + 0.35, -0.2],
          ],
          0.065,
          '#8d8ab9',
          '囊腔连接管',
        );
    }
    tube(
      group,
      [
        [0.6, -0.15, -0.4],
        [0.96, -0.18, -0.64],
        [1.23, 0.03, -0.42],
        [1.28, 0.08, -0.05],
      ],
      0.065,
      '#a39ac7',
      '内质网管状分支',
    );
    return annotate(group, [
      ['扁平膜囊与囊腔', '#8d8ab9'],
      ['胞质侧核糖体', '#dac7e9'],
      ['相连的膜管', '#a39ac7'],
    ]);
  }

  function golgi() {
    seed = 404;
    const group = new T.Group();
    const colors = ['#529f99', '#60b7aa', '#77c9b6', '#8bd8bd', '#ace2c0'];
    for (let i = 0; i < 5; i++) {
      cisterna(group, {
        y: -0.43 + i * 0.23,
        width: 1.06 - i * 0.065,
        depth: 0.53 - i * 0.018,
        bend: 0.25,
        color: colors[i],
        name: i === 4 ? '顺面膜囊' : i === 0 ? '反面膜囊' : '中间膜囊',
        phase: i * 0.4,
      });
    }
    for (let i = 0; i < 9; i++) {
      const side = i % 2 ? -1 : 1;
      sphere(
        group,
        [side * (1.05 + random() * 0.24), -0.4 + random() * 1.1, (random() - 0.5) * 0.9],
        0.075 + random() * 0.035,
        '#a6ddbb',
        '运输囊泡',
      );
    }
    for (let i = 0; i < 3; i++)
      tube(
        group,
        [
          [0.25 + i * 0.22, -0.42, -0.35],
          [0.45 + i * 0.2, -0.54, -0.65],
          [0.7 + i * 0.15, -0.5, -0.74],
        ],
        0.045,
        '#529f99',
        '反面高尔基网络示意',
      );
    return annotate(group, [
      ['顺面（接收侧）', '#ace2c0'],
      ['层叠扁平膜囊', '#77c9b6'],
      ['反面与分选网络', '#529f99'],
      ['运输囊泡', '#a6ddbb'],
    ]);
  }

  function lysosome() {
    seed = 505;
    const group = new T.Group();
    const point = (u, v) => {
      const theta = Math.PI * u,
        phi = 2.22 + 4.5 * v;
      return [
        -Math.cos(phi) * Math.sin(theta) * 0.74,
        Math.cos(theta) * 0.71,
        Math.sin(phi) * Math.sin(theta) * 0.74,
      ];
    };
    add(group, surface(40, SEGMENTS, point), '#c09d53', '单层膜系统（单个脂质双层）');
    cutEdge(group, point, '#ebc985', '单膜剖切边缘', 0.022);
    for (let i = 0; i < 19; i++) {
      const a = random() * TAU,
        r = random() * 0.43;
      sphere(
        group,
        [Math.cos(a) * r, (random() - 0.5) * 0.72, Math.sin(a) * r],
        [0.055, 0.075, 0.05],
        '#ecd4a0',
        '酸性水解酶示意',
        0.13,
      );
    }
    for (let i = 0; i < 4; i++) {
      sphere(
        group,
        [-0.2 + random() * 0.4, -0.35 + random() * 0.15, random() * 0.3],
        0.08 + random() * 0.04,
        '#9c7351',
        '待降解物质示意',
        0.17,
      );
    }
    for (let i = 0; i < 6; i++) {
      const a = 2.6 + i * 0.5;
      const p = [-Math.cos(a) * 0.63, 0.31, Math.sin(a) * 0.63];
      sphere(group, p, [0.05, 0.07, 0.05], '#ddd6a2', '膜上质子泵示意');
    }
    return annotate(group, [
      ['单个脂质双层膜', '#c09d53'],
      ['酸性水解酶', '#ecd4a0'],
      ['待降解物质', '#9c7351'],
      ['膜上质子泵', '#ddd6a2'],
    ]);
  }

  function ribosome() {
    seed = 606;
    const group = new T.Group();
    // 80S 胞质核糖体：表现不对称亚基及亚基间隙，不声称是原子级结构。
    const large = sphere(
      group,
      [-0.08, 0.28, -0.07],
      [0.62, 0.44, 0.49],
      '#8ea5d1',
      '60S 大亚基',
      0.065,
    );
    large.rotation.z = -0.16;
    sphere(group, [-0.12, 0.63, -0.09], [0.22, 0.18, 0.21], '#8ea5d1', '大亚基中央突起', 0.08);
    sphere(group, [0.12, -0.3, 0.07], [0.53, 0.26, 0.4], '#6b9cae', '40S 小亚基体部', 0.065);
    sphere(group, [0.41, -0.16, 0.05], [0.24, 0.25, 0.29], '#6b9cae', '小亚基头部', 0.07);
    tube(
      group,
      [
        [-0.43, 0.4, 0],
        [-0.7, 0.49, -0.07],
        [-0.85, 0.36, -0.09],
      ],
      0.055,
      '#b1badb',
      '大亚基侧向突起',
    );
    tube(
      group,
      [
        [-1, -0.12, 0.33],
        [-0.6, -0.13, 0.35],
        [-0.1, -0.11, 0.35],
        [0.48, -0.12, 0.34],
        [0.92, -0.01, 0.2],
      ],
      0.023,
      '#ecc27c',
      'mRNA',
    );
    // tRNA 位于亚基间隙；肽链从大亚基侧的出口伸出，两者分别绘制。
    for (const x of [-0.16, 0.13])
      tube(
        group,
        [
          [x, -0.08, 0.3],
          [x - 0.04, 0.13, 0.28],
          [x + 0.12, 0.2, 0.13],
        ],
        0.025,
        '#d5bd92',
        'tRNA 示意',
      );
    tube(
      group,
      [
        [-0.46, 0.28, 0.29],
        [-0.61, 0.23, 0.4],
        [-0.73, 0.31, 0.5],
        [-0.84, 0.23, 0.55],
        [-0.97, 0.3, 0.53],
      ],
      0.031,
      '#dfa6c4',
      '新生多肽链',
    );
    return annotate(group, [
      ['60S 大亚基', '#8ea5d1'],
      ['40S 小亚基', '#6b9cae'],
      ['mRNA', '#ecc27c'],
      ['tRNA', '#d5bd92'],
      ['新生多肽链', '#dfa6c4'],
    ]);
  }

  return { nucleus, mitochondrion, er, golgi, lysosome, ribosome };
};
