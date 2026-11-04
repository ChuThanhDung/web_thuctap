import React from 'react';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from '../pages/Login.jsx';

afterEach(() => vitest.unstubAllGlobals());

describe('Login with two-factor authentication', () => {
  it('asks for the 6-digit code before logging in', async () => {
    const auth = { access_token: 'session', user: { email: 'ktt@example.com', role: 'chief_accountant' } };
    const fetchMock = vitest.fn(async (url) => ({
      ok: true,
      status: 200,
      json: async () => (String(url).endsWith('/auth/login') ? { mfa_required: true, mfa_token: 'challenge-token' } : auth),
    }));
    vitest.stubGlobal('fetch', fetchMock);
    const onLogin = vitest.fn();
    render(
      <MemoryRouter>
        <Login onLogin={onLogin} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('Nhập vào email'), { target: { value: 'ktt@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('********'), { target: { value: 'Mat-khau-2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('heading', { name: 'Xác thực hai lớp' })).toBeInTheDocument();
    expect(onLogin).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Mã 6 số/), { target: { value: '12a3456' } });
    expect(screen.getByLabelText(/Mã 6 số/)).toHaveValue('123456');
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(auth));
    const [, request] = fetchMock.mock.calls[1];
    expect(JSON.parse(request.body)).toEqual({ mfa_token: 'challenge-token', code: '123456' });
  });
});
