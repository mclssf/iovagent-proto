<script lang="ts" setup>
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Icon } from '@packages/icon';
import { ElButton, ElForm, ElFormItem, ElInput, ElMessage } from 'element-plus';

import { setToken } from '@/utils/auth';

import { strokeIconPaths } from './AgentWork/strokeIconPaths';

interface Particle {
  baseX: number;
  baseY: number;
  speed: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
}

const isDev = import.meta.env.DEV;
const router = useRouter();
const formRef = ref();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const loading = ref(false);
const loginForm = reactive({
  username: isDev ? import.meta.env.VITE_APP_DEFAULT_LOGIN_USERNAME || 'demo' : '',
  password: isDev ? import.meta.env.VITE_APP_DEFAULT_LOGIN_PASSWORD || 'demo123' : '',
});

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};
const lockIconPath = 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6z';

let frameId = 0;
let particles: Particle[] = [];

function resetParticles(width: number, height: number) {
  const count = Math.max(58, Math.floor((width * height) / 15000));
  particles = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.15 + Math.random() * 0.38;
    const x = Math.random() * width;
    const y = Math.random() * height;
    return {
      baseX: x,
      baseY: y,
      speed,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      x,
      y,
    };
  });
}

function sizeCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(rect.width * ratio);
  canvas.height = Math.floor(rect.height * ratio);
  const context = canvas.getContext('2d');
  context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  resetParticles(rect.width, rect.height);
}

function drawLoginCanvas(time = 0) {
  const canvas = canvasRef.value;
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return;

  const { width, height } = canvas.getBoundingClientRect();
  context.clearRect(0, 0, width, height);

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#151b24');
  background.addColorStop(0.55, '#202733');
  background.addColorStop(1, '#111827');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.save();
  context.translate(width * 0.52, height * 0.52);
  context.rotate(time * 0.00008);
  context.strokeStyle = 'rgba(203, 213, 225, 0.08)';
  for (let radius = 120; radius < Math.max(width, height); radius += 86) {
    context.beginPath();
    context.ellipse(0, 0, radius * 1.35, radius * 0.58, 0, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();

  particles.forEach((particle) => {
    particle.x += particle.vx;
    particle.y += particle.vy;

    if (particle.x < -20 || particle.x > width + 20) particle.vx *= -1;
    if (particle.y < -20 || particle.y > height + 20) particle.vy *= -1;

    particle.baseX += Math.sin(time * 0.0007 * particle.speed) * 0.04;
    particle.baseY += Math.cos(time * 0.0006 * particle.speed) * 0.04;
  });

  const maxDistance = 150;
  let connectionIndex = 0;
  for (let i = 0; i < particles.length; i += 1) {
    for (let j = i + 1; j < particles.length; j += 1) {
      const a = particles[i]!;
      const b = particles[j]!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > maxDistance) continue;

      const alpha = (1 - distance / maxDistance) * 0.42;
      const reveal = (time * 0.00035 + connectionIndex * 0.017) % 1;
      const endX = a.x + (b.x - a.x) * reveal;
      const endY = a.y + (b.y - a.y) * reveal;

      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(endX, endY);
      context.strokeStyle = `rgba(148, 163, 184, ${alpha})`;
      context.lineWidth = 1;
      context.stroke();
      connectionIndex += 1;
    }
  }

  particles.forEach((particle, index) => {
    const pulse = 1.6 + Math.sin(time * 0.002 + index) * 0.8;
    context.beginPath();
    context.arc(particle.x, particle.y, pulse, 0, Math.PI * 2);
    context.fillStyle = index % 5 === 0 ? 'rgba(45, 212, 191, 0.85)' : 'rgba(226, 232, 240, 0.72)';
    context.fill();
  });

  frameId = requestAnimationFrame(drawLoginCanvas);
}

function handleResize() {
  if (canvasRef.value) sizeCanvas(canvasRef.value);
}

async function handleLogin() {
  try {
    await formRef.value.validate();
    loading.value = true;
    await new Promise((resolve) => {
      setTimeout(resolve, 280);
    });
    localStorage.setItem('iovagent_login_user', loginForm.username);
    setToken('fake-login-token');
    ElMessage.success('登录成功');
    router.push('/index');
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await nextTick();
  if (canvasRef.value) sizeCanvas(canvasRef.value);
  drawLoginCanvas();
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frameId);
  window.removeEventListener('resize', handleResize);
});
</script>

<template>
  <div class="agent-login-page">
    <section class="login-visual-panel">
      <canvas ref="canvasRef" class="login-canvas" aria-hidden="true"></canvas>
      <div class="brand-title">大卡数字人</div>
      <div class="visual-copy">
        <div class="visual-kicker">Digital Freight Agent</div>
        <h1>连接·高效·智能</h1>
      </div>
    </section>

    <section class="login-form-panel">
      <div class="login-card">
        <div class="login-card-header">
          <div class="login-mark">
            <Icon :svg="strokeIconPaths.truck" :size="20" />
          </div>
          <div>
            <h2>欢迎登录</h2>
            <p>在途物流智能体工作台</p>
          </div>
        </div>

        <ElForm ref="formRef" :model="loginForm" :rules="rules" class="login-form" label-position="top">
          <ElFormItem label="用户名" prop="username">
            <ElInput v-model.trim="loginForm.username" placeholder="请输入用户名" class="login-input" size="large">
              <template #prefix>
                <Icon :svg="strokeIconPaths.user" :size="16" />
              </template>
            </ElInput>
          </ElFormItem>

          <ElFormItem label="密码" prop="password">
            <ElInput v-model.trim="loginForm.password" type="password" show-password placeholder="请输入密码" class="login-input" size="large">
              <template #prefix>
                <Icon :svg="lockIconPath" :size="16" />
              </template>
            </ElInput>
          </ElFormItem>
        </ElForm>

        <ElButton class="login-btn" type="primary" :loading="loading" @click="handleLogin">登录</ElButton>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.agent-login-page {
  display: grid;
  min-height: 100vh;
  min-width: 1120px;
  grid-template-columns: minmax(0, 1.2fr) minmax(420px, 0.8fr);
  background: #f6f6f4;
  color: #0f172a;
}

.login-visual-panel {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  border-right: 1px solid #deded9;
}

.login-canvas {
  position: absolute;
  inset: 0;
  height: 100%;
  width: 100%;
}

.brand-title {
  position: absolute;
  top: 28px;
  left: 34px;
  color: #f8fafc;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0;
}

.visual-copy {
  position: absolute;
  left: 72px;
  bottom: 108px;
  color: #f8fafc;
}

.visual-kicker {
  margin-bottom: 18px;
  color: rgb(226 232 240 / 70%);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.visual-copy h1 {
  margin: 0;
  font-size: 54px;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1.08;
}

.login-form-panel {
  display: flex;
  min-height: 100vh;
  align-items: center;
  justify-content: center;
  padding: 56px;
  background: #f6f6f4;
}

.login-card {
  width: 100%;
  max-width: 420px;
  border: 1px solid #deded9;
  border-radius: 8px;
  background: #ffffff;
  padding: 28px;
}

.login-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 30px;
}

.login-mark {
  display: flex;
  height: 36px;
  width: 36px;
  align-items: center;
  justify-content: center;
  border: 1px solid #deded9;
  border-radius: 8px;
  background: #f7f7f5;
  color: #334155;
}

.login-card-header h2 {
  margin: 0;
  color: #0f172a;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.35;
}

.login-card-header p {
  margin: 3px 0 0;
  color: #64748b;
  font-size: 13px;
}

.login-form {
  :deep(.el-form-item) {
    margin-bottom: 20px;
  }

  :deep(.el-form-item__label) {
    margin-bottom: 6px;
    color: #475569;
    font-size: 13px;
    font-weight: 600;
    line-height: 20px;
  }
}

.login-input {
  :deep(.el-input__wrapper) {
    border-radius: 6px;
    background: #fbfbfa;
    box-shadow: 0 0 0 1px #deded9 inset;
  }

  :deep(.el-input__wrapper.is-focus) {
    background: #ffffff;
    box-shadow: 0 0 0 1px #0f172a inset;
  }
}

.login-btn {
  width: 100%;
  height: 42px;
  margin-top: 4px;
  border: 0;
  border-radius: 6px;
  background: #0f172a;
  font-size: 14px;
  font-weight: 700;
}

.login-btn:hover,
.login-btn:focus {
  background: #1e293b;
}
</style>
