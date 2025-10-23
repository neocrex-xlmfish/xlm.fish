<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

class LitepaperController extends AbstractController
{
    #[Route('/litepaper', name: 'litepaper')]
    public function index(): Response
    {
        return $this->render('pages/litepaper.html.twig');
    }
}
