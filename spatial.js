/* Local, procedural geometry. Three.js MIT; no image textures or remote assets. */
(() => {
  'use strict';
  const host = document.querySelector('.canvas-host'),
    stage = document.querySelector('.stage'),
    status = document.querySelector('.stage-status');
  const data = window.CELL_DATA,
    detail = document.body.dataset.organelle,
    reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let renderer,
    factoryIntro = null;
  function fallback() {
    factoryIntro?.finish();
    const replay = document.querySelector('#intro-replay');
    if (replay) replay.hidden = true;
    document.querySelector('.fallback').hidden = false;
    status.textContent = '';
    document.querySelector('.controls').hidden = true;
    document.querySelector('.gesture').hidden = true;
  }
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
  } catch (e) {
    fallback();
    return;
  }
  const T = THREE,
    scene = new T.Scene(),
    camera = new T.PerspectiveCamera(38, 1, 0.1, 100);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const cell = new T.Group();
  scene.add(cell);
  scene.add(new T.HemisphereLight(0xc7f7ff, 0x24303b, 2));
  const key = new T.DirectionalLight(0xffe9da, 3.4);
  key.position.set(-4, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -8;
  key.shadow.camera.right = 8;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -8;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 28;
  key.shadow.bias = -0.00015;
  key.shadow.normalBias = 0.018;
  scene.add(key);
  const rim = new T.DirectionalLight(0x77cfef, 3);
  rim.position.set(4, 3, -5);
  scene.add(rim);
  const fill = new T.PointLight(0xc1b2ff, 22, 20);
  fill.position.set(-5, 1, -2);
  scene.add(fill);
  const floor = new T.Mesh(new T.CircleGeometry(13, 96), new T.ShadowMaterial({ opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.4;
  floor.receiveShadow = true;
  scene.add(floor);
  // Three.js 的默认深度投影不跟随材质透明度；使用有序覆盖让投影同步淡入淡出。
  // 深度材质保留标准顶点着色器，建筑的形变与投影使用同一组 morph targets。
  function prepareShadow(object) {
    const depth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking });
    const opacity = {};
    Object.defineProperty(opacity, 'value', { get: () => object.material.opacity });
    depth.onBeforeCompile = (shader) => {
      shader.uniforms.shadowCoverage = opacity;
      shader.fragmentShader = 'uniform float shadowCoverage;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        `#include <alphatest_fragment>
        vec2 lowBits = mod(floor(gl_FragCoord.xy), 2.0);
        vec2 highBits = mod(floor(gl_FragCoord.xy / 2.0), 2.0);
        float lowRank = 2.0 * lowBits.x + 3.0 * lowBits.y - 4.0 * lowBits.x * lowBits.y;
        float highRank = 2.0 * highBits.x + 3.0 * highBits.y - 4.0 * highBits.x * highBits.y;
        float threshold = (4.0 * lowRank + highRank + 0.5) / 16.0;
        if (shadowCoverage <= threshold) discard;`,
      );
    };
    depth.customProgramCacheKey = () => 'cell-shadow-coverage-v1';
    object.customDepthMaterial = depth;
  }
  function material(color, extra = {}) {
    return new T.MeshStandardMaterial({ color, roughness: 0.33, metalness: 0.1, ...extra });
  }
  function mesh(group, geo, mat, pos = [0, 0, 0], scale = [1, 1, 1]) {
    const m = new T.Mesh(geo, mat);
    m.position.set(...pos);
    m.scale.set(...scale);
    m.castShadow = !mat.transparent && Math.max(...scale) >= 0.1;
    m.receiveShadow = false;
    if (m.castShadow) prepareShadow(m);
    group.add(m);
    return m;
  }
  const sphere = new T.SphereGeometry(1, 20, 14);
  function ball(g, p, s, c, extra = {}) {
    return mesh(g, sphere, material(c, extra), p, Array.isArray(s) ? s : [s, s, s]);
  }
  function tube(g, points, r, c, extra = {}) {
    const curve = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
    return mesh(
      g,
      new T.TubeGeometry(curve, Math.max(24, points.length * 7), r, 10, false),
      material(c, extra),
    );
  }
  const TAU = Math.PI * 2;
  let seed = 49;
  function rand() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  // 六个细胞器的几何构造在独立的 organelle-models.js 中。
  const factories = window.createCellModels(T, { detail: Boolean(detail) });
  const layout = {
    nucleus: [-1.65, 0.72, -0.12],
    mitochondrion: [2.05, 0.38, -1.35],
    er: [-0.05, 0.28, -1.25],
    golgi: [2.1, 0.5, 1.25],
    lysosome: [-2.55, 0.43, 1.68],
    ribosome: [-0.38, 0.35, 2.2],
  };
  const models = [],
    pickables = [],
    labels = new Map();
  const glowVertex =
    'varying vec3 vNormal;varying vec3 vPosition;void main(){vNormal=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position+normal*0.025,1.0);vPosition=p.xyz;gl_Position=projectionMatrix*p;}';
  const glowFragment =
    'uniform vec3 glowColor;uniform float strength;varying vec3 vNormal;varying vec3 vPosition;void main(){float rim=pow(1.0-abs(dot(normalize(vNormal),normalize(-vPosition))),2.7);gl_FragColor=vec4(glowColor,rim*strength*.8);}';
  function decorate(g, d) {
    const meshes = [];
    g.traverse((o) => {
      if (o.isMesh) meshes.push(o);
    });
    g.userData = {
      ...g.userData,
      id: d.id,
      hover: 0,
      base: new T.Vector3(...(detail ? [0, 0, 0] : layout[d.id])),
      glows: [],
      meshes,
    };
    for (const m of meshes) {
      // 剖面薄膜密集相邻，避免自阴影把内部结构压成黑块；地面的投影仍保留。
      m.receiveShadow = false;
      m.castShadow = !m.material.transparent || m.material.opacity >= 0.98;
      if (m.castShadow) prepareShadow(m);
      m.userData.organelle = g;
      pickables.push(m);
      const mat = new T.ShaderMaterial({
        uniforms: { glowColor: { value: new T.Color(d.color) }, strength: { value: 0 } },
        vertexShader: glowVertex,
        fragmentShader: glowFragment,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        side: T.FrontSide,
      });
      const glow = new T.Mesh(m.geometry, mat);
      glow.raycast = () => {};
      glow.visible = false;
      m.add(glow);
      mat.userData.mesh = glow;
      g.userData.glows.push(mat);
    }
    g.position.copy(g.userData.base);
    cell.add(g);
    models.push(g);
  }
  for (const d of data) {
    if (!detail || d.id === detail) {
      const g = factories[d.id]();
      decorate(g, d);
      if (d.id === 'mitochondrion') g.rotation.y = -0.35;
      if (d.id === 'er') g.rotation.y = -0.8;
    }
  }

  // 介绍页的颜色图例与模型使用同一份结构元数据。
  if (detail) {
    const legend = document.createElement('section');
    legend.className = 'anatomy-legend';
    legend.setAttribute('aria-label', '模型结构图例');
    const title = document.createElement('p');
    title.className = 'eyebrow';
    title.textContent = 'MODEL KEY / 结构图例';
    legend.appendChild(title);
    const list = document.createElement('ul');
    for (const part of models[0].userData.anatomy) {
      const item = document.createElement('li');
      const dot = document.createElement('span');
      dot.style.background = part.color;
      dot.setAttribute('aria-hidden', 'true');
      item.append(dot, document.createTextNode(part.label));
      list.appendChild(item);
    }
    legend.appendChild(list);
    document.querySelector('.detail-copy').appendChild(legend);
    document.querySelector('.stage-sub').textContent = '/ 结构剖面示意';
  }
  if (!detail) {
    const membrane = mesh(
      cell,
      new T.SphereGeometry(1, 80, 36, 0, TAU, Math.PI / 2, Math.PI / 2),
      material('#70bfc1', {
        transparent: true,
        opacity: 0.2,
        side: T.DoubleSide,
        depthWrite: false,
        metalness: 0.05,
      }),
      [0, 0, 0],
      [4.55, 1.13, 3.35],
    );
    membrane.castShadow = false;
    const pts = [];
    for (let i = 0; i <= 100; i++) {
      const a = (i / 100) * TAU,
        r = 1 + 0.025 * Math.sin(a * 5);
      pts.push([4.55 * Math.cos(a) * r, 0.03 * Math.sin(a * 3), 3.35 * Math.sin(a) * r]);
    }
    tube(cell, pts, 0.055, '#82c9cb', { transparent: true, opacity: 0.6 });
    for (let k = 0; k < 3; k++) {
      const pts = [];
      for (let i = 0; i <= 100; i++) {
        const a = (i / 100) * TAU;
        pts.push([
          (4.3 - k * 0.38) * Math.cos(a),
          -0.38 - k * 0.26,
          (3.16 - k * 0.29) * Math.sin(a),
        ]);
      }
      tube(cell, pts, 0.012, '#93d6cd', { transparent: true, opacity: 0.23 });
    }
    for (let i = 0; i < 65; i++) {
      const a = rand() * TAU,
        r = Math.sqrt(rand());
      const x = Math.cos(a) * 4.1 * r,
        z = Math.sin(a) * 3 * r;
      if (models.some((m) => Math.hypot(m.position.x - x, m.position.z - z) < 0.85)) continue;
      ball(cell, [x, -0.15 + rand() * 0.2, z], 0.025 + rand() * 0.035, '#77b3b4', {
        roughness: 0.45,
      });
    }
    for (const d of data) {
      const a = document.createElement('a');
      a.className = 'model-label';
      a.href = 'organelles/' + d.id + '.html';
      a.dataset.id = d.id;
      a.style.setProperty('--accent', d.color);
      a.textContent = d.name;
      document.querySelector('.labels').appendChild(a);
      labels.set(d.id, a);
    }
  }
  const platform = new T.Mesh(
    new T.RingGeometry(detail ? 2.2 : 5.15, detail ? 2.215 : 5.17, 100),
    new T.MeshBasicMaterial({
      color: 0x658b8d,
      transparent: true,
      opacity: 0.25,
      side: T.DoubleSide,
    }),
  );
  platform.rotation.x = -Math.PI / 2;
  platform.position.y = -1.37;
  scene.add(platform);
  // 介绍页按结构尺寸设置初始取景，避免小模型在画布中难以看清。
  const detailDistance =
    { nucleus: 5.6, mitochondrion: 5.8, er: 5.1, golgi: 5.2, lysosome: 3.9, ribosome: 4.2 }[
      detail
    ] || 7.7;
  let width = 1,
    height = 1,
    distance = detail ? detailDistance : 12.7,
    yaw = 0,
    pitch = detail ? 0.24 : 0.58,
    auto = false,
    hovered = null,
    transition = null,
    paused = false;
  const pointer = new T.Vector2(9, 9),
    raycaster = new T.Raycaster();
  let drag = null,
    lastFrame = performance.now(),
    raf = 0,
    pinch = null;
  const pointers = new Map();
  function fit() {
    const r = host.getBoundingClientRect();
    width = r.width;
    height = r.height;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(() => {
    fit();
    if (transition) cancelTransition();
  }).observe(host);
  fit();
  function cameraUpdate(opening) {
    const d =
      distance *
      (width / height < 1 ? Math.min(1.9, (1 / (width / height)) * (detail ? 0.87 : 1.08)) : 1);
    camera.position.set(0, Math.sin(detail ? 0.32 : 0.57) * d, Math.cos(detail ? 0.32 : 0.57) * d);
    camera.lookAt(0, detail ? 0.05 : (opening?.aimY ?? 0.25), 0);
  }
  function highlight(g) {
    if (transition || factoryIntro?.active) return;
    hovered = g;
    host.style.cursor = g ? 'pointer' : 'grab';
    labels.forEach((a, id) => a.classList.toggle('active', !!g && g.userData.id === id));
    if (!detail)
      status.textContent = g
        ? data.find((d) => d.id === g.userData.id).name + ' · 点击进入'
        : '拖动细胞，发现不同角度';
  }
  function hit(e) {
    const r = host.getBoundingClientRect();
    pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(pickables, false)[0]?.object.userData.organelle || null;
  }
  function linkHover(e) {
    const a = e.target.closest('[data-id]');
    if (a) highlight(models.find((g) => g.userData.id === a.dataset.id));
  }
  document.querySelectorAll('[data-id]').forEach((a) => {
    a.addEventListener('pointerenter', linkHover);
    a.addEventListener('focus', linkHover);
    a.addEventListener('pointerleave', () => highlight(null));
    a.addEventListener('blur', () => highlight(null));
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
      const g = models.find((g) => g.userData.id === a.dataset.id);
      if (g) {
        e.preventDefault();
        enter(g, a.href);
      }
    });
  });
  host.addEventListener('pointerdown', (e) => {
    if (transition || factoryIntro?.active || e.button > 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    host.setPointerCapture(e.pointerId);
    if (pointers.size === 2) {
      const p = [...pointers.values()];
      pinch = { gap: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), distance };
      if (drag) drag.moved = true;
      return;
    }
    drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false };
  });
  host.addEventListener('pointermove', (e) => {
    if (transition || factoryIntro?.active) return;
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const p = [...pointers.values()],
        gap = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      distance = T.MathUtils.clamp(
        (pinch.distance * pinch.gap) / Math.max(1, gap),
        detail ? Math.max(2.5, detailDistance * 0.6) : 11,
        detail ? 13 : 23,
      );
      return;
    }
    if (drag) {
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 5) drag.moved = true;
      if (drag.moved) {
        yaw += dx * 0.007;
        pitch = T.MathUtils.clamp(pitch + dy * 0.006, -0.6, 1.05);
        highlight(null);
      }
      drag.x = e.clientX;
      drag.y = e.clientY;
    } else if (e.pointerType !== 'touch') {
      highlight(hit(e));
    }
  });
  host.addEventListener('pointerup', (e) => {
    const wasPinch = !!pinch;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && !drag.moved && !wasPinch && !detail) {
      const g = hit(e);
      if (g) enter(g, 'organelles/' + g.userData.id + '.html');
    }
    drag = null;
  });
  host.addEventListener('pointercancel', () => {
    drag = null;
    pinch = null;
    pointers.clear();
  });
  host.addEventListener('lostpointercapture', () => {
    if (!pointers.size) drag = null;
  });
  host.addEventListener('pointerleave', () => {
    if (!drag) highlight(null);
  });
  host.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (transition || factoryIntro?.active) return;
      distance = T.MathUtils.clamp(
        distance + e.deltaY * 0.009,
        detail ? Math.max(2.5, detailDistance * 0.6) : 11,
        detail ? 13 : 23,
      );
    },
    { passive: false },
  );
  document.querySelector('#rotate-toggle').addEventListener('click', (e) => {
    auto = !auto;
    e.currentTarget.setAttribute('aria-pressed', String(auto));
    e.currentTarget.textContent = auto ? '暂停旋转' : '自动旋转';
  });
  document.querySelector('#reset-view').addEventListener('click', () => {
    yaw = 0;
    pitch = detail ? 0.24 : 0.58;
    distance = detail ? detailDistance : 12.7;
    auto = false;
    const b = document.querySelector('#rotate-toggle');
    b.setAttribute('aria-pressed', 'false');
    b.textContent = '自动旋转';
    highlight(null);
  });
  function ease(t) {
    return t * t * (3 - 2 * t);
  }
  function enter(g, url) {
    if (transition || factoryIntro?.active) return;
    if (reduced.matches) {
      location.href = url;
      return;
    }
    const before = {
      position: g.position.clone(),
      quaternion: g.quaternion.clone(),
      scale: g.scale.clone(),
    };
    scene.updateMatrixWorld(true);
    scene.attach(g);
    const start = g.position.clone(),
      end = new T.Vector3();
    camera.getWorldDirection(end);
    end.multiplyScalar(6.5).add(camera.position);
    const bounds = new T.Box3().setFromObject(g).getSize(new T.Vector3());
    const scale = Math.min(1.4, 2.7 / Math.max(bounds.x, bounds.y, bounds.z));
    const fades = [];
    cell.traverse((o) => {
      if (o.material && !o.material.isShaderMaterial) {
        fades.push({
          mat: o.material,
          opacity: o.material.opacity,
          transparent: o.material.transparent,
        });
        if (!o.material.transparent) o.material.needsUpdate = true;
        o.material.transparent = true;
      }
    });
    transition = {
      g,
      url,
      start,
      end,
      time: performance.now(),
      before,
      scale,
      fades,
      quaternion: g.quaternion.clone(),
    };
    stage.classList.add('transitioning');
    status.textContent = '正在探索 · ' + data.find((d) => d.id === g.userData.id).name;
  }
  function cancelTransition() {
    if (!transition) return;
    const t = transition;
    cell.add(t.g);
    t.g.position.copy(t.before.position);
    t.g.quaternion.copy(t.before.quaternion);
    t.g.scale.copy(t.before.scale);
    t.fades.forEach((x) => {
      x.mat.opacity = x.opacity;
      if (x.mat.transparent !== x.transparent) x.mat.needsUpdate = true;
      x.mat.transparent = x.transparent;
    });
    transition = null;
    stage.classList.remove('transitioning');
    highlight(null);
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cancelTransition();
  });
  window.addEventListener('pageshow', () => {
    cancelTransition();
    paused = false;
    lastFrame = performance.now();
    if (!raf) raf = requestAnimationFrame(frame);
  });
  window.addEventListener('pagehide', () => {
    paused = true;
    cancelAnimationFrame(raf);
    raf = 0;
    cancelTransition();
  });
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    paused = true;
    cancelAnimationFrame(raf);
    raf = 0;
    fallback();
  });
  if (!detail && window.createFactoryIntro) {
    factoryIntro = window.createFactoryIntro(T, {
      cell,
      models,
      stage,
      reduced,
      prepareShadow,
      reset: () => {
        cancelTransition();
        yaw = 0;
        pitch = 0.58;
        distance = 12.7;
        auto = false;
        hovered = null;
        drag = null;
        pinch = null;
        pointers.clear();
        document.querySelector('#rotate-toggle').setAttribute('aria-pressed', 'false');
        document.querySelector('#rotate-toggle').textContent = '自动旋转';
        labels.forEach((label) => label.classList.remove('active'));
        models.forEach((model) => {
          model.userData.hover = 0;
        });
      },
    });
  }
  const entered = detail && new URLSearchParams(location.search).get('enter') === '1';
  const started = performance.now();
  function frame(now) {
    raf = 0;
    if (paused) return;
    const elapsedDelta = Math.max(0, (now - lastFrame) / 1000);
    const dt = Math.min(0.05, elapsedDelta);
    lastFrame = now;
    const opening = factoryIntro?.update(Math.min(0.25, elapsedDelta));
    if (opening) {
      yaw = opening.yaw;
      distance = opening.distance;
    }
    if (auto && !opening && !transition && !drag && !reduced.matches) yaw += dt * 0.18;
    cell.rotation.set(pitch - (detail ? 0.24 : 0.58), yaw, 0);
    cameraUpdate(opening);
    for (const g of models) {
      if (transition && transition.g === g) continue;
      const target = g === hovered ? 1 : 0;
      g.userData.hover += (target - g.userData.hover) * Math.min(1, dt * 9);
      const h = g.userData.hover;
      g.position.copy(g.userData.base);
      g.rotation.z = 0;
      g.scale.setScalar(1);
      if (!reduced.matches && !factoryIntro?.active) {
        g.position.y += h * 0.36 + (detail ? 0 : Math.sin(now * 0.001 + models.indexOf(g)) * 0.035);
        g.rotation.z = h * 0.06;
        g.scale.setScalar(1 + h * 0.035);
      }
      g.userData.glows.forEach((m) => {
        m.uniforms.strength.value = h;
        m.userData.mesh.visible = h > 0.01;
      });
      g.userData.meshes.forEach((m) => {
        m.material.emissive.set(data.find((d) => d.id === g.userData.id).color);
        m.material.emissiveIntensity = h * 0.12;
      });
    }
    if (entered && !reduced.matches && now - started < 1000) {
      const t = ease(Math.min(1, (now - started) / 1000));
      models[0].position.y += (1 - t) * 0.4;
      models[0].scale.setScalar(1 + (1 - t) * 0.15);
    }
    if (transition) {
      const t = transition,
        p = Math.min(1, (now - t.time) / 1350),
        lift = ease(Math.min(1, p / 0.28)),
        travel = ease(Math.max(0, (p - 0.22) / 0.78));
      const raised = t.start.clone().add(new T.Vector3(0, 0.75 * lift, 0));
      t.g.position.lerpVectors(raised, t.end, travel);
      t.g.scale.setScalar(T.MathUtils.lerp(1, t.scale, travel));
      t.g.quaternion.copy(t.quaternion);
      t.g.rotateY(Math.sin(p * Math.PI) * 0.28);
      t.g.userData.glows.forEach((m) => {
        m.uniforms.strength.value = 0.8 * (1 - travel);
        m.userData.mesh.visible = travel < 0.99;
      });
      t.fades.forEach((x) => (x.mat.opacity = x.opacity * (1 - travel * 0.94)));
      if (p === 1) {
        location.href = t.url + (t.url.includes('?') ? '&' : '?') + 'enter=1';
        paused = true;
      }
    }
    scene.updateMatrixWorld(true);
    factoryIntro?.projectLabel(camera);
    if (!detail && !transition) {
      const occupied = [];
      for (const g of models) {
        const a = labels.get(g.userData.id),
          v = cell.localToWorld(g.userData.base.clone());
        v.y += g.userData.id === 'nucleus' ? 1.38 : 0.72;
        v.project(camera);
        let x = T.MathUtils.clamp((v.x * 0.5 + 0.5) * width, 48, width - 48),
          y = T.MathUtils.clamp((-v.y * 0.5 + 0.5) * height, 64, height - 85);
        for (const p of occupied) {
          if (Math.abs(p.x - x) < 95 && Math.abs(p.y - y) < 34) y += 36;
        }
        occupied.push({ x, y });
        a.style.left = x + 'px';
        a.style.top = y + 'px';
      }
    }
    renderer.render(scene, camera);
    if (!paused) raf = requestAnimationFrame(frame);
  }
  if (detail) document.querySelector('.gesture').textContent = '拖动旋转 · 滚轮缩放';
  status.textContent = detail ? '结构剖面 · 拖动查看另一面' : '拖动细胞，发现不同角度';
  stage.dataset.ready = 'true';
  raf = requestAnimationFrame(frame);
  // Read-only diagnostic snapshots make local rendering and interaction verifiable.
  window.cellExplorer = {
    snapshot: () => ({
      ready: true,
      opening: factoryIntro?.snapshot() || null,
      detail: detail || null,
      rotation: [cell.rotation.x, cell.rotation.y],
      distance,
      hovered: hovered?.userData.id || null,
      transition: transition?.g.userData.id || null,
      meshes: pickables.length,
      triangles: renderer.info.render.triangles,
      models: models.map((g) => ({
        id: g.userData.id,
        lift: g.position.y - g.userData.base.y,
        glow: g.userData.hover,
      })),
    }),
  };
})();
