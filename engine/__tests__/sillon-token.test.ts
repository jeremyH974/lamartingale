import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { identifySillonToken, requireSillonToken } from '../middleware/sillon-token';

function mkReq(headers: Record<string, string> = {}): Request {
  return { headers, sillonToken: undefined } as unknown as Request;
}

function mkRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res as Response;
}

describe('sillon-token middleware', () => {
  beforeEach(() => {
    process.env.SILLON_PREVIEW_TOKENS = '';
  });

  describe('identifySillonToken', () => {
    it('next() without setting sillonToken when env is empty', () => {
      process.env.SILLON_PREVIEW_TOKENS = '';
      const req = mkReq({ 'x-sillon-token': 'whatever' });
      const next = vi.fn();
      identifySillonToken(req, mkRes(), next);
      expect(next).toHaveBeenCalledOnce();
      expect(req.sillonToken).toBeUndefined();
    });

    it('sets req.sillonToken when header matches a CSV entry', () => {
      process.env.SILLON_PREVIEW_TOKENS = 'alpha,beta,gamma';
      const req = mkReq({ 'x-sillon-token': 'beta' });
      const next = vi.fn();
      identifySillonToken(req, mkRes(), next);
      expect(req.sillonToken).toBe('beta');
      expect(next).toHaveBeenCalledOnce();
    });

    it('does not set token when header is invalid', () => {
      process.env.SILLON_PREVIEW_TOKENS = 'alpha,beta';
      const req = mkReq({ 'x-sillon-token': 'wrong' });
      const next = vi.fn();
      identifySillonToken(req, mkRes(), next);
      expect(req.sillonToken).toBeUndefined();
      expect(next).toHaveBeenCalledOnce();
    });

    it('trims whitespace and ignores empty tokens in env', () => {
      process.env.SILLON_PREVIEW_TOKENS = '  alpha , , beta  ';
      const req = mkReq({ 'x-sillon-token': 'alpha' });
      const next = vi.fn();
      identifySillonToken(req, mkRes(), next);
      expect(req.sillonToken).toBe('alpha');
    });
  });

  describe('requireSillonToken', () => {
    it('401 when no header', () => {
      process.env.SILLON_PREVIEW_TOKENS = 'alpha';
      const req = mkReq({});
      const res = mkRes();
      const next = vi.fn();
      requireSillonToken(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('401 when header invalid', () => {
      process.env.SILLON_PREVIEW_TOKENS = 'alpha';
      const req = mkReq({ 'x-sillon-token': 'wrong' });
      const res = mkRes();
      const next = vi.fn();
      requireSillonToken(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('401 when env is empty (no token configured = no access)', () => {
      process.env.SILLON_PREVIEW_TOKENS = '';
      const req = mkReq({ 'x-sillon-token': 'alpha' });
      const res = mkRes();
      const next = vi.fn();
      requireSillonToken(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('next() and sets token when header matches', () => {
      process.env.SILLON_PREVIEW_TOKENS = 'alpha,beta';
      const req = mkReq({ 'x-sillon-token': 'beta' });
      const res = mkRes();
      const next = vi.fn();
      requireSillonToken(req, res, next);
      expect(req.sillonToken).toBe('beta');
      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('passes through if identifySillonToken already set req.sillonToken', () => {
      process.env.SILLON_PREVIEW_TOKENS = 'alpha';
      const req = mkReq({});
      req.sillonToken = 'alpha'; // pre-set by identifySillonToken upstream
      const res = mkRes();
      const next = vi.fn();
      requireSillonToken(req, res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
