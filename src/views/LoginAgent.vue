<script lang="ts" setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Icon } from '@packages/icon';
import { ElButton, ElForm, ElFormItem, ElInput, ElMessage } from 'element-plus';

import cubeLogo from '@/assets/imgs/loginAgent.png';
import { setToken } from '@/utils/auth';

import { pluginUserLogin } from './http';

const isDev = import.meta.env.DEV;
const router = useRouter();
const formRef = ref();
const loginForm = reactive({
  username: isDev ? import.meta.env.VITE_APP_DEFAULT_LOGIN_USERNAME : '',
  password: isDev ? import.meta.env.VITE_APP_DEFAULT_LOGIN_PASSWORD : '',
});

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};
const loading = ref(false);

const loginTitle = '大卡数字人';

const handleLogin = async () => {
  try {
    await formRef.value.validate();
    console.log(1234);
    loading.value = true;
    const params = {
      phone: loginForm.username,
      captcha: loginForm.password,
      type: 1,
    };
    const { error, data: token } = await pluginUserLogin(params);
    if (error) {
      ElMessage.error(error.message);
      return;
    }
    setToken(token);
    router.push('/index');
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="agent-login-page">
    <div class="login-stage">
      <img class="cube-logo" :src="cubeLogo" alt="logo" />
      <h1 class="login-title">{{ loginTitle }}</h1>

      <ElForm ref="formRef" :model="loginForm" :rules="rules" class="login-form">
        <ElFormItem prop="username">
          <ElInput v-model.trim="loginForm.username" placeholder="请输入用户名" class="login-input">
            <template #prefix>
              <Icon :size="16" icon="mdi:account-outline" />
            </template>
          </ElInput>
        </ElFormItem>

        <ElFormItem prop="password">
          <ElInput v-model.trim="loginForm.password" type="password" show-password placeholder="请输入密码" class="login-input">
            <template #prefix>
              <Icon :size="16" icon="mdi:lock-outline" />
            </template>
          </ElInput>
        </ElFormItem>
      </ElForm>

      <ElButton class="login-btn" type="primary" :loading="loading" @click="handleLogin">安全登录</ElButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.agent-login-page {
  height: 100%;
  min-width: 1200px;
  background: #3d4450;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-stage {
  position: relative;
  width: 400px;
  height: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.cube-logo {
  width: 400px;
  height: 366px;
}

.login-title {
  margin: 20px 0;
  color: #ffffff;
  width: 100%;
  text-align: center;
  font-size: 32px;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
}

.login-form {
  width: 300px;
}

.login-btn {
  margin-top: 20px;
  height: 40px;
  padding: 6px 15px;
  border: 0;
  border-radius: 2px;
  background: var(--el-color-primary);
  font-size: 16px;
}
</style>
