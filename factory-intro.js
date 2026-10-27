/** 微缩工厂 → 细胞：与主页共用场景、相机和细胞器，按就绪后的时间播放。 */
'use strict';
window.createFactoryIntro = function (T, { cell, models, stage, reduced, reset, prepareShadow }) {
  const duration = 12;
  const storageKey = 'cell-factory-intro-v2';
  const factory = new T.Group();
  factory.name = '现实工厂开场';
  cell.add(factory);
  const morphs = [],
    lamps = [],
    packets = [],
    structures = [];
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const smooth = (x) => {
    x = clamp(x);
    return x * x * (3 - 2 * x);
  };
  const mix = T.MathUtils.lerp;
  const colors = {
    nucleus: '#d4a5ff',
    mitochondrion: '#ffb16b',
    er: '#a8a4ff',
    golgi: '#79e2c3',
    lysosome: '#f3d280',
    ribosome: '#85c8ff',
  };
  // 五秒观察工厂，随后按功能顺序逐个转换，九秒左右完成。
  const starts = { nucleus: 5, mitochondrion: 6, er: 7, golgi: 8, lysosome: 7.6, ribosome: 8 };
  const mappings = [
    ['nucleus', '控制中心 → 细胞核'],
    ['mitochondrion', '能源站 → 线粒体'],
    ['er', '生产管网 → 内质网'],
    ['golgi', '分拣中心 → 高尔基体'],
  ];
  const localMorph = (id) => (id ? smooth((elapsed - starts[id]) / 1.05) : morph);
  const localReveal = (id) => (id ? smooth((elapsed - starts[id] - 0.65) / 0.45) : reveal);
  const dark = new T.Color('#55787e');
  function material(color, extra = {}) {
    return new T.MeshStandardMaterial({
      color,
      roughness: 0.38,
      metalness: 0.35,
      transparent: true,
      ...extra,
    });
  }
  function add(group, geometry, mat, position = [0, 0, 0]) {
    const mesh = new T.Mesh(geometry, mat);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    prepareShadow(mesh);
    group.add(mesh);
    return mesh;
  }
  function box(group, size, position, color = '#45636a') {
    return add(group, new T.BoxGeometry(...size), material(color), position);
  }
  function tube(group, points, radius, color, closed = false) {
    const curve = new T.CatmullRomCurve3(
      points.map((p) => new T.Vector3(...p)),
      closed,
    );
    return add(group, new T.TubeGeometry(curve, 96, radius, 6, closed), material(color));
  }
  function captureMorph(mesh, target) {
    mesh.geometry.morphAttributes.position = [new T.Float32BufferAttribute(target, 3)];
    mesh.updateMorphTargets();
    mesh.frustumCulled = false;
    // 平滑的目标法线与顶点同步插值，避免从硬质建筑变圆时仍保留方盒阴影。
    const end = mesh.geometry.clone();
    end.morphAttributes = {};
    end.setAttribute('position', new T.Float32BufferAttribute(target, 3));
    end.computeVertexNormals();
    mesh.geometry.morphAttributes.normal = [end.attributes.normal.clone()];
    end.dispose();
    morphs.push(mesh);
  }

  // 地坪、周界路和内部运输线构成真实工厂的空间，而不是一组孤立方块。
  const base = box(factory, [9.6, 0.16, 7.35], [0, -0.7, 0], '#26454d');
  base.material.roughness = 0.7;
  for (let x = -4; x <= 4; x++) {
    const line = box(factory, [0.012, 0.008, 6.7], [x, -0.61, 0], '#537478');
    structures.push(line);
  }
  for (let z = -3; z <= 3; z++)
    structures.push(box(factory, [8.9, 0.008, 0.012], [0, -0.61, z], '#537478'));
  const perimeter = [];
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    perimeter.push([
      4.55 * Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.32),
      -0.48,
      3.35 * Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.32),
    ]);
  }
  const boundary = tube(factory, perimeter, 0.045, '#9bc7bf', true);
  const bp = boundary.geometry.attributes.position;
  const targetBoundary = [];
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i),
      z = bp.getZ(i),
      a = Math.atan2(z / 3.35, x / 4.55);
    targetBoundary.push(4.55 * Math.cos(a), bp.getY(i) + 0.5, 3.35 * Math.sin(a));
  }
  captureMorph(boundary, targetBoundary);

  const sizes = {
    nucleus: [1.65, 1.9, 1.45],
    mitochondrion: [1.9, 0.8, 0.95],
    er: [1.75, 0.9, 1.1],
    golgi: [1.6, 1.2, 1.2],
    lysosome: [0.85, 0.85, 0.85],
    ribosome: [1.05, 0.7, 0.8],
  };
  models.forEach((model, index) => {
    const id = model.userData.id,
      color = colors[id],
      position = model.userData.base;
    const group = new T.Group();
    group.position.copy(position);
    factory.add(group);
    const [w, h, d] = sizes[id],
      centerY = -position.y - 0.58 + h / 2;
    const body = add(group, new T.BoxGeometry(w, h, d, 12, 12, 12), material('#55787e'), [
      0,
      centerY,
      0,
    ]);
    body.userData.color = new T.Color(color);
    const vertices = body.geometry.attributes.position,
      target = [];
    for (let i = 0; i < vertices.count; i++) {
      const direction = new T.Vector3(
        vertices.getX(i) / (w / 2),
        vertices.getY(i) / (h / 2),
        vertices.getZ(i) / (d / 2),
      ).normalize();
      let x, y, z;
      if (id === 'nucleus') {
        x = direction.x * 1.12;
        y = direction.y * 1.02;
        z = direction.z * 1.02;
      } else if (id === 'mitochondrion') {
        x = direction.x * 1.32;
        y = direction.y * 0.48 + 0.17 * Math.cos(direction.x * 2.8);
        z = direction.z * 0.56;
      } else if (id === 'er' || id === 'golgi') {
        x = direction.x * (id === 'er' ? 1.03 : 0.9);
        y = direction.y * 0.48;
        z = direction.z * 0.65 + Math.sin(direction.x * 3.5) * 0.2;
      } else {
        x = direction.x * 0.52;
        y = direction.y * 0.5;
        z = direction.z * 0.5;
      }
      target.push(x, y - centerY, z);
    }
    captureMorph(body, target);
    // 楼层窗带、屋顶设备、装卸口都围绕主体建造，转换时向主体收拢。
    const fittings = new T.Group();
    group.add(fittings);
    for (let row = 0; row < (id === 'nucleus' ? 4 : 2); row++) {
      for (let column = 0; column < 5; column++) {
        const lamp = box(
          fittings,
          [w * 0.11, 0.075, 0.015],
          [-w * 0.38 + column * w * 0.19, centerY - h * 0.26 + row * h * 0.18, d / 2 + 0.012],
          color,
        );
        lamp.material.emissive.set(color);
        lamps.push(lamp);
      }
    }
    box(fittings, [w * 1.05, 0.06, d * 1.05], [0, centerY + h / 2 + 0.025, 0], '#91aaa5');
    if (id === 'nucleus') {
      box(fittings, [0.035, 0.6, 0.035], [0.35, centerY + h / 2 + 0.3, 0]);
      add(
        fittings,
        new T.SphereGeometry(0.07, 12, 8),
        material(color, { emissive: color, emissiveIntensity: 1 }),
        [0.35, centerY + h / 2 + 0.6, 0],
      );
    } else if (id === 'mitochondrion') {
      for (let i = 0; i < 3; i++) {
        add(fittings, new T.CylinderGeometry(0.17, 0.21, 0.65, 16), material('#78928d'), [
          -0.58 + i * 0.58,
          centerY + h / 2 + 0.32,
          0,
        ]);
        add(fittings, new T.TorusGeometry(0.18, 0.026, 6, 18), material(color), [
          -0.58 + i * 0.58,
          centerY + h / 2 + 0.55,
          0,
        ]).rotation.x = Math.PI / 2;
      }
    } else if (id === 'golgi') {
      for (let i = 0; i < 4; i++)
        box(fittings, [w * 1.12, 0.045, d * 1.12], [0, centerY - h * 0.3 + i * h * 0.2, 0], color);
    } else if (id === 'er') {
      for (let i = 0; i < 4; i++) {
        const points = [
          [-0.8, centerY + h / 2 + 0.12, -0.4 + i * 0.25],
          [0, centerY + h / 2 + 0.12, -0.4 + i * 0.25],
          [0.8, centerY + h / 2 + 0.12, -0.4 + i * 0.25],
        ];
        const pipe = tube(group, points, 0.045, color);
        const attribute = pipe.geometry.attributes.position,
          end = [];
        for (let j = 0; j < attribute.count; j++) {
          const x = attribute.getX(j),
            y = attribute.getY(j),
            z = attribute.getZ(j);
          end.push(
            x * 1.2,
            y - centerY - h / 2 + Math.sin(x * 3.2 + i) * 0.18,
            z + Math.sin(x * 2.3) * 0.3,
          );
        }
        captureMorph(pipe, end);
      }
    }
    fittings.userData.centerY = centerY;
    structures.push(fittings);
    // 流动光点展示供能、运输和分拣；路线是类比，不表示真实细胞通路。
    const end = new T.Vector3(position.x, -0.48, position.z);
    const curve = new T.CatmullRomCurve3([
      new T.Vector3(-1.65, -0.48, -0.12),
      new T.Vector3(position.x, -0.48, -0.12),
      end,
    ]);
    if (index > 0) {
      structures.push(add(factory, new T.TubeGeometry(curve, 36, 0.024, 6), material('#739d9e')));
      for (let j = 0; j < 3; j++) {
        const packet = add(
          factory,
          new T.SphereGeometry(0.052, 10, 8),
          material(color, { emissive: color, emissiveIntensity: 1.6 }),
        );
        packet.userData.introId = id;
        packets.push({ packet, curve, offset: j / 3 + index * 0.07 });
      }
    }
    group.traverse((object) => {
      object.userData.introId = id;
    });
  });
  const factoryMaterials = [];
  factory.traverse((object) => {
    if (object.material)
      factoryMaterials.push({ mat: object.material, id: object.userData.introId });
  });
  const targetObjects = cell.children
    .filter((child) => child !== factory)
    .map((object) => ({ object, visible: object.visible }));
  const targetMaterials = new Map();
  const materialOwners = new Map();
  cell.children
    .filter((child) => child !== factory)
    .forEach((child) =>
      child.traverse((object) => {
        if (
          object.material &&
          !object.material.isShaderMaterial &&
          !targetMaterials.has(object.material)
        ) {
          materialOwners.set(object.material, child.userData.id);
          targetMaterials.set(object.material, {
            opacity: object.material.opacity,
            transparent: object.material.transparent,
            depthWrite: object.material.depthWrite,
          });
        }
      }),
    );
  const overlay = document.createElement('div');
  overlay.className = 'factory-intro';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="factory-intro-top"><span>CELL FACTORY <small>一场尺度的旅行</small></span><button type="button" id="intro-skip">跳过动画 ↗</button></div>
    <div class="factory-intro-copy"><p class="factory-kicker"></p><h2></h2><p class="factory-caption"></p></div>
    <div class="factory-mapping" hidden aria-hidden="true"></div>
    <div class="factory-intro-foot"><span>现实工厂 → 生命工厂</span><div class="intro-timeline" aria-hidden="true"><i></i></div><span class="intro-ready">场景已就绪</span></div>`;
  stage.appendChild(overlay);
  const replay = document.querySelector('#intro-replay');
  const mappingLabel = overlay.querySelector('.factory-mapping');
  let mappingId = null;
  const inactive = [
    ...document.querySelectorAll('header, .intro, #structures, footer, .labels, .stage-bottom'),
  ];
  let active = false,
    elapsed = 0,
    phase = '',
    placeholder = null,
    previousOverflow = '',
    inertStates = [],
    replaying = false;
  let morph = 0,
    reveal = 0;
  const originalStyle = stage.getAttribute('style');
  function restoreMaterial(original, mat) {
    const changed = mat.transparent !== original.transparent;
    Object.assign(mat, original);
    // 透明双面材质与普通双面材质的着色分支不同，恢复时必须刷新程序。
    if (changed) mat.needsUpdate = true;
  }
  function remember() {
    try {
      sessionStorage.setItem(storageKey, 'seen');
    } catch {
      /* 受限浏览器仍可正常播放和跳过。 */
    }
  }
  function finish({ focus = false } = {}) {
    if (!active) return;
    active = false;
    elapsed = duration;
    morph = 1;
    reveal = 1;
    factory.visible = false;
    targetObjects.forEach(({ object, visible }) => {
      object.visible = visible;
    });
    targetMaterials.forEach(restoreMaterial);
    overlay.hidden = true;
    stage.classList.remove('factory-opening');
    if (originalStyle === null) stage.removeAttribute('style');
    else stage.setAttribute('style', originalStyle);
    placeholder?.remove();
    placeholder = null;
    document.body.style.overflow = previousOverflow;
    inactive.forEach((element, index) => {
      element.inert = inertStates[index];
    });
    reset();
    remember();
    if (focus || replaying) document.querySelector('#reset-view').focus({ preventScroll: true });
  }
  function start(manual = false) {
    if (active) return;
    if (reduced.matches) {
      remember();
      return;
    }
    reset();
    replaying = manual;
    window.scrollTo({ top: 0, behavior: 'instant' });
    placeholder = document.createElement('div');
    // 继承主页画布的响应式尺寸，屏幕旋转后也能回到准确位置。
    placeholder.className = 'stage intro-stage-placeholder';
    placeholder.style.visibility = 'hidden';
    placeholder.setAttribute('aria-hidden', 'true');
    stage.before(placeholder);
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inertStates = inactive.map((element) => element.inert);
    inactive.forEach((element) => {
      element.inert = true;
    });
    active = true;
    elapsed = 0;
    phase = '';
    factory.visible = true;
    targetObjects.forEach(({ object }) => {
      object.visible = false;
    });
    overlay.hidden = false;
    stage.classList.add('factory-opening');
    targetMaterials.forEach((original, mat) => {
      if (!mat.transparent) mat.needsUpdate = true;
      mat.transparent = true;
      mat.opacity = 0;
      mat.depthWrite = false;
    });
    update(0);
    // 跳过按钮始终可用；Tab 不会进入暂时隐藏的主页控件。
    overlay.querySelector('#intro-skip').focus({ preventScroll: true });
  }
  function update(dt) {
    // 某些嵌入式浏览器不派发媒体查询变化事件，逐帧同步按钮状态。
    if (replay && replay.disabled !== reduced.matches) syncPreference();
    if (!active) return null;
    if (reduced.matches) {
      finish();
      return null;
    }
    elapsed += document.hidden ? 0 : dt;
    morph = smooth((elapsed - 5) / 4.1);
    reveal = smooth((elapsed - 8.2) / 0.9);
    targetObjects.forEach(({ object, visible }) => {
      object.visible = visible && localReveal(object.userData.id) > 0.001;
    });
    // 投影由深度材质按实际透明度淡出，不在某一帧突然关闭。
    const docking = smooth((elapsed - 11.2) / 0.8);
    factoryMaterials.forEach(({ mat, id }) => {
      const amount = localReveal(id);
      mat.opacity = 1 - amount;
      mat.depthWrite = amount < 0.001;
    });
    factory.visible = reveal < 0.999;
    targetMaterials.forEach((original, mat) => {
      const amount = localReveal(materialOwners.get(mat));
      if (amount >= 0.999) restoreMaterial(original, mat);
      else mat.opacity = original.opacity * amount;
    });
    morphs.forEach((mesh) => {
      const amount = localMorph(mesh.userData.introId);
      mesh.morphTargetInfluences[0] = amount;
      if (mesh.userData.color) mesh.material.color.copy(dark).lerp(mesh.userData.color, amount);
    });
    base.material.opacity = 1 - smooth((elapsed - 5.7) / 2.8);
    base.position.y = -0.7 - morph * 0.45;
    structures.forEach((object) => {
      const fold = object.userData.introId
        ? smooth((elapsed - starts[object.userData.introId] - 0.2) / 0.8)
        : smooth((elapsed - 6) / 2.6);
      if (object.isGroup) {
        object.scale.setScalar(1 - fold * 0.22);
        object.position.y = -fold * 0.1;
      }
      object.traverse((child) => {
        if (child.material)
          child.material.opacity = (1 - fold) * (1 - localReveal(object.userData.introId));
      });
    });
    lamps.forEach((lamp, index) => {
      lamp.material.emissiveIntensity =
        (0.3 + 1.6 * smooth((elapsed - index * 0.026) / 1.1)) *
        (1 - localMorph(lamp.userData.introId));
    });
    packets.forEach(({ packet, curve, offset }) => {
      packet.position.copy(curve.getPointAt((elapsed * 0.22 + offset) % 1));
      packet.material.opacity = 1 - smooth((elapsed - 5.2) / 3.2);
    });
    const nextPhase = elapsed < 4 ? 'factory' : elapsed < 8 ? 'transform' : 'cell';
    if (nextPhase !== phase) {
      phase = nextPhase;
      const texts = {
        factory: [
          '01 / THE VISIBLE FACTORY',
          '一座工厂，<br>让不同的工作<span>协同发生。</span>',
          '控制、供能、生产、运输，各司其职。',
        ],
        transform: [
          '02 / A CHANGE OF SCALE',
          '一个细胞，<br>也有自己的<span>分工。</span>',
          '从控制与供能，到生产与分发。',
        ],
        cell: [
          '03 / THE LIVING FACTORY',
          '生命的运转，<br><span>从这里开始。</span>',
          '现在，去发现每一个细胞器。',
        ],
      };
      const [kicker, title, caption] = texts[phase];
      overlay.querySelector('.factory-kicker').textContent = kicker;
      overlay.querySelector('h2').innerHTML = title;
      overlay.querySelector('.factory-caption').textContent = caption;
      overlay.querySelector('.factory-intro-copy').animate(
        [
          { opacity: 0, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 450, easing: 'ease-out' },
      );
    }
    const entry = mappings.find(
      ([id], index) =>
        elapsed >= starts[id] &&
        elapsed < (index < mappings.length - 1 ? starts[mappings[index + 1][0]] : 9.1),
    );
    mappingId = entry?.[0] || null;
    mappingLabel.hidden = !mappingId;
    if (entry) {
      mappingLabel.textContent = entry[1];
      mappingLabel.style.setProperty('--mapping-color', colors[mappingId]);
    }
    overlay.style.opacity = String(1 - docking);
    overlay.querySelector('.intro-timeline i').style.transform =
      `scaleX(${clamp(elapsed / duration)})`;
    // 全屏画布收回原来的主页位置，同一个模型和相机持续渲染。
    const destination = placeholder.getBoundingClientRect();
    stage.style.left = mix(0, destination.left, docking) + 'px';
    stage.style.top = mix(0, destination.top, docking) + 'px';
    stage.style.width = mix(innerWidth, destination.width, docking) + 'px';
    stage.style.height = mix(innerHeight, destination.height, docking) + 'px';
    stage.style.borderRadius = mix(0, innerWidth <= 650 ? 12 : 18, docking) + 'px';
    if (elapsed >= duration) {
      finish();
      return null;
    }
    return {
      yaw: -0.23 * (1 - smooth((elapsed - 3) / 6.1)),
      aimY: mix(1.05, 0.25, docking),
      distance:
        mix(mix(16.8, 15.1, smooth((elapsed - 3) / 6.1)), 12.7, docking) *
        Math.max(
          1,
          0.58 /
            (mix(innerWidth, destination.width, docking) /
              mix(innerHeight, destination.height, docking)),
        ),
    };
  }
  overlay.querySelector('#intro-skip').addEventListener('click', () => finish({ focus: true }));
  document.addEventListener('keydown', (event) => {
    if (!active) return;
    if (event.key === 'Escape') finish({ focus: true });
    if (event.key === 'Tab') {
      event.preventDefault();
      overlay.querySelector('#intro-skip').focus();
    }
  });
  replay?.addEventListener('click', () => start(true));
  function syncPreference() {
    if (replay) {
      replay.disabled = reduced.matches;
      replay.textContent = reduced.matches ? '已减少动态效果' : '重播开场';
    }
    if (reduced.matches && active) finish();
  }
  reduced.addEventListener('change', syncPreference);
  syncPreference();
  let seen = false;
  try {
    seen = sessionStorage.getItem(storageKey) === 'seen';
  } catch {
    /* 只影响重复播放。 */
  }
  factory.visible = false;
  if ((!seen && !location.hash) || new URLSearchParams(location.search).get('intro') === '1')
    start();
  return {
    get active() {
      return active;
    },
    update,
    projectLabel(camera) {
      if (!active || !mappingId) return;
      const model = models.find((model) => model.userData.id === mappingId);
      const point = cell.localToWorld(model.userData.base.clone());
      point.y += mappingId === 'nucleus' ? 1.2 : 0.65;
      point.project(camera);
      const width = stage.clientWidth,
        height = stage.clientHeight;
      const half = mappingLabel.offsetWidth / 2 + 12;
      mappingLabel.style.left =
        T.MathUtils.clamp((point.x * 0.5 + 0.5) * width, half, width - half) + 'px';
      mappingLabel.style.top =
        T.MathUtils.clamp((-point.y * 0.5 + 0.5) * height, height * 0.36, height - 75) + 'px';
    },
    start,
    finish,
    snapshot: () => ({
      active,
      elapsed,
      duration,
      phase,
      morph,
      reveal,
      factoryVisible: factory.visible,
      mappingId,
      sequence: Object.fromEntries(
        Object.keys(starts).map((id) => [id, { morph: localMorph(id), reveal: localReveal(id) }]),
      ),
    }),
  };
};
