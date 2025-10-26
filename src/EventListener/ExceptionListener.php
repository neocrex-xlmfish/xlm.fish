<?php
namespace App\EventListener;

use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpFoundation\RequestStack;
use Twig\Environment as TwigEnvironment;

class ExceptionListener
{
    private LoggerInterface $logger;
    private TwigEnvironment $twig;
    private RequestStack $requestStack;
    private bool $debug;

    public function __construct(LoggerInterface $logger, TwigEnvironment $twig, RequestStack $requestStack, bool $debug = false)
    {
        $this->logger = $logger;
        $this->twig = $twig;
        $this->requestStack = $requestStack;
        $this->debug = $debug;
    }

    public function onKernelException(ExceptionEvent $event): void
    {
        // Let Symfony show the debug page when kernel debug is enabled
        if ($this->debug) {
            return;
        }

        $exception = $event->getThrowable();
        $request = $this->requestStack->getMainRequest() ?? $event->getRequest();

        // Log full exception with context (stack traces go to logs only)
        $this->logger->error('Uncaught exception: '.$exception->getMessage(), [
            'exception' => $exception,
            'path' => $request->getPathInfo(),
            'method' => $request->getMethod(),
            'ip' => $request->getClientIp(),
        ]);

        // Determine status code (500 for non-HTTP exceptions)
        $statusCode = $exception instanceof \Symfony\Component\HttpKernel\Exception\HttpExceptionInterface
            ? $exception->getStatusCode()
            : 500;

        // Render the branded Twig template; fallback to minimal HTML if rendering fails
        try {
            $content = $this->twig->render('bundles/TwigBundle/Exception/error.html.twig', [
                'status_code' => $statusCode,
                'status_text' => Response::$statusTexts[$statusCode] ?? 'Error',
            ]);
        } catch (\Throwable $e) {
            $content = sprintf('<h1>Sorry — something went wrong</h1><p>Error %d</p>', $statusCode);
        }

        $response = new Response($content, $statusCode);
        $event->setResponse($response);
    }
}
